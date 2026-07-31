const SESSION_COOKIE = "bizkep_session";
const SESSION_HOURS = 12;
// The Workers Free plan has a 10 ms CPU ceiling. A server-only pepper preserves
// resistance to an offline D1 leak while this PBKDF2 cost remains edge-safe.
const PASSWORD_ITERATIONS = 10000;
const ROLES = new Set(["Owner", "Manager", "Attendant"]);
const MAX_JSON_BYTES = 16384;
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) {
        if (!env.DB) return json({error:"Database binding is not configured."}, 503);
        return await handleApi(request, env, url);
      }
      const response = await env.ASSETS.fetch(request);
      return secureAssetResponse(response);
    } catch (error) {
      console.error(JSON.stringify({
        message: "BizKep request failed",
        path: url.pathname,
        method: request.method,
        error: error instanceof Error ? error.message : String(error)
      }));
      return json({error:"The request could not be completed."}, 500);
    }
  }
};

async function handleApi(request, env, url) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && !validOrigin(request, url)) return json({error:"Invalid request origin."}, 403);

  if (url.pathname === "/api/status" && method === "GET") {
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
    return json({
      configured:Number(row?.count || 0) > 0,
      signupEnabled:true,
      turnstileSiteKey:String(env.TURNSTILE_SITE_KEY || "")
    });
  }
  if (url.pathname === "/api/bootstrap" && method === "POST") return bootstrap(request, env);
  if (url.pathname === "/api/signup" && method === "POST") return signup(request, env);
  if (url.pathname === "/api/login" && method === "POST") return login(request, env);
  if (url.pathname === "/api/logout" && method === "POST") return logout(request, env);

  const auth = await authenticate(request, env);
  if (!auth) return json({error:"Authentication required."}, 401);
  if (url.pathname === "/api/session" && method === "GET") return json({authenticated:true,user:publicUser(auth)});
  if (url.pathname === "/api/state" && method === "GET") return json({state:await loadState(env.DB, auth)});
  if (url.pathname === "/api/action" && method === "POST") return performAction(request, env, auth);
  return json({error:"Not found."}, 404);
}

async function bootstrap(request, env) {
  const body = await readJson(request);
  if (!await verifyTurnstile(request, env, body.turnstileToken, "bootstrap")) {
    return json({error:"Security verification failed. Please try again."},403);
  }
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
  if (Number(count?.count || 0) > 0) return json({error:"BizKep is already configured."}, 409);
  if (!env.BOOTSTRAP_TOKEN) return json({error:"The owner setup secret has not been configured."},503);
  if (!timingSafeEqual(String(body.setupToken||""),String(env.BOOTSTRAP_TOKEN))) {
    return json({error:"Invalid owner setup code."},403);
  }
  const name = clean(body.name, 80);
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const businessName = clean(body.businessName, 120);
  if (!name || !username || !businessName || password.length < 10) {
    return json({error:"Enter all fields and use a password of at least 10 characters."}, 400);
  }
  return createOwnerWorkspace(request,env,{name,username,password,businessName,businessType:"Pharmacy / Medicine shop",auditAction:"bootstrap"});
}

async function signup(request, env) {
  const body = await readJson(request);
  if (!await verifyTurnstile(request, env, body.turnstileToken, "signup")) {
    return json({error:"Security verification failed. Please try again."},403);
  }
  if (!env.BOOTSTRAP_TOKEN) return json({error:"Account creation is temporarily unavailable."},503);
  const name = clean(body.name, 80);
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const businessName = clean(body.businessName, 120);
  const businessType = clean(body.businessType,80) || "Pharmacy / Medicine shop";
  if (!name || !username || !businessName || password.length < 10) {
    return json({error:"Enter all fields and use a password of at least 10 characters."},400);
  }
  const existing = await env.DB.prepare("SELECT id FROM users WHERE username=?1 LIMIT 1").bind(username).first();
  if (existing) return json({error:"That username is unavailable. Please choose another."},409);
  return createOwnerWorkspace(request,env,{name,username,password,businessName,businessType,auditAction:"signup"});
}

async function createOwnerWorkspace(request,env,{name,username,password,businessName,businessType,auditAction}) {
  const now = new Date().toISOString();
  const businessId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const credentials = await hashPassword(password,env.BOOTSTRAP_TOKEN);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO businesses (id,name,type,phone,address,created_at) VALUES (?1,?2,?3,'','',?4)")
        .bind(businessId,businessName,businessType,now),
      env.DB.prepare("INSERT INTO users (id,business_id,name,username,password_hash,password_salt,password_iterations,role,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'Owner',?8)")
        .bind(userId,businessId,name,username,credentials.hash,credentials.salt,PASSWORD_ITERATIONS,now),
      auditStatement(env.DB,businessId,userId,auditAction,"business",businessId,null,{name:businessName,type:businessType},request,now)
    ]);
  } catch (error) {
    if (/users\.username|UNIQUE constraint/i.test(String(error))) {
      return json({error:"That username is unavailable. Please choose another."},409);
    }
    throw error;
  }
  return createSessionResponse(env.DB,{id:userId,business_id:businessId,name,username,role:"Owner"},request);
}

async function login(request, env) {
  const body = await readJson(request);
  if (!await verifyTurnstile(request, env, body.turnstileToken, "login")) {
    return json({error:"Security verification failed. Please try again."},403);
  }
  if (!env.BOOTSTRAP_TOKEN) return json({error:"Sign in is temporarily unavailable."},503);
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const user = await env.DB.prepare("SELECT * FROM users WHERE username=?1 ORDER BY created_at LIMIT 1").bind(username).first();
  if (!user || user.status !== "active") return json({error:"Invalid username or password."}, 401);
  if (user.locked_until && Date.parse(user.locked_until) > Date.now()) return json({error:"Account temporarily locked. Try again later."}, 429);
  const valid = await verifyPassword(password,user.password_salt,user.password_hash,user.password_iterations,env.BOOTSTRAP_TOKEN);
  if (!valid) {
    const attempts = Number(user.failed_attempts || 0) + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now()+15*60000).toISOString() : null;
    await env.DB.prepare("UPDATE users SET failed_attempts=?1,locked_until=?2 WHERE id=?3").bind(attempts,lockedUntil,user.id).run();
    return json({error:lockedUntil?"Too many attempts. Account locked for 15 minutes.":"Invalid username or password."}, 401);
  }
  await env.DB.prepare("UPDATE users SET failed_attempts=0,locked_until=NULL,last_login_at=?1 WHERE id=?2").bind(new Date().toISOString(),user.id).run();
  return createSessionResponse(env.DB,user,request);
}

async function logout(request, env) {
  const token = cookieValue(request.headers.get("Cookie"),SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?1").bind(await sha256(token)).run();
  return json({ok:true},200,{"Set-Cookie":expiredCookie()});
}

async function authenticate(request, env) {
  const token = cookieValue(request.headers.get("Cookie"),SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(`
    SELECT u.id,u.business_id,u.name,u.username,u.phone,u.role,u.status,s.expires_at
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=?1 AND s.expires_at>?2 AND u.status='active'
  `).bind(await sha256(token),new Date().toISOString()).first();
  return row || null;
}

async function createSessionResponse(db, user, request) {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime()+SESSION_HOURS*3600000);
  await db.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?1,?2,?3,?4,?5)")
    .bind(crypto.randomUUID(),user.id,await sha256(token),expires.toISOString(),now.toISOString()).run();
  return json({authenticated:true,user:publicUser(user)},200,{"Set-Cookie":sessionCookie(token,expires)});
}

async function performAction(request, env, auth) {
  const body = await readJson(request);
  const action = String(body.action || "");
  const payload = body.payload || {};
  const handlers = {
    create_product,
    update_product,
    request_adjustment,
    review_adjustment,
    create_sale,
    create_expense,
    void_expense,
    create_debt,
    update_debt,
    record_debt_payment,
    update_business,
    create_user,
    update_user_role,
    disable_user
  };
  if (!handlers[action]) return json({error:"Unknown action."},400);
  const result = await handlers[action](env.DB,auth,payload,request,env);
  if (result?.error) return json({error:result.error},result.status || 400);
  return json({ok:true,state:await loadState(env.DB,auth)});
}

async function create_product(db, auth, p, request) {
  if (!allow(auth,["Owner","Manager"])) return denied();
  const product = validateProduct(p,true);
  if (product.error) return product;
  const id=crypto.randomUUID(), now=new Date().toISOString(), opening=Math.max(0,toInt(p.stock));
  const statements=[
    db.prepare("INSERT INTO products (id,business_id,name,sku,category,reorder_level,cost_price,selling_price,expiry,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)")
      .bind(id,auth.business_id,product.name,product.sku,product.category,product.reorder,product.cost,product.price,product.expiry,now)
  ];
  if(opening>0) statements.push(db.prepare("INSERT INTO inventory_ledger (id,business_id,product_id,event_type,quantity_delta,balance_after,reference_type,reference_id,reason,actor_user_id,approved_by_user_id,created_at) VALUES (?1,?2,?3,'opening_stock',?4,?4,'product',?3,'Opening stock',?5,?5,?6)")
    .bind(crypto.randomUUID(),auth.business_id,id,opening,auth.id,now));
  statements.push(auditStatement(db,auth.business_id,auth.id,"create","product",id,null,{...product,openingStock:opening},request,now));
  await db.batch(statements);
}

async function update_product(db, auth, p, request) {
  if (!allow(auth,["Owner","Manager"])) return denied();
  const existing=await ownedProduct(db,auth,p.id);
  if(!existing)return{error:"Product not found.",status:404};
  const product=validateProduct(p,false);if(product.error)return product;
  const cost=auth.role==="Owner"?product.cost:Number(existing.cost_price);
  const price=auth.role==="Owner"?product.price:Number(existing.selling_price);
  const now=new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE products SET name=?1,sku=?2,category=?3,reorder_level=?4,cost_price=?5,selling_price=?6,expiry=?7,updated_at=?8 WHERE id=?9 AND business_id=?10")
      .bind(product.name,product.sku,product.category,product.reorder,cost,price,product.expiry,now,existing.id,auth.business_id),
    auditStatement(db,auth.business_id,auth.id,"update","product",existing.id,existing,{...product,cost,price},request,now)
  ]);
}

async function request_adjustment(db, auth, p, request) {
  const product=await ownedProduct(db,auth,p.productId);if(!product)return{error:"Product not found.",status:404};
  const delta=toInt(p.quantityDelta),reason=String(p.reasonCode||""),notes=clean(p.notes,300);
  if(!delta||!["purchase","damage","expiry","return","correction"].includes(reason)||!notes)return{error:"Quantity, reason and notes are required."};
  const id=crypto.randomUUID(),now=new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO adjustment_requests (id,business_id,product_id,quantity_delta,reason_code,notes,requested_by,requested_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)")
      .bind(id,auth.business_id,product.id,delta,reason,notes,auth.id,now),
    auditStatement(db,auth.business_id,auth.id,"request","stock_adjustment",id,null,{productId:product.id,delta,reason,notes},request,now)
  ]);
}

async function review_adjustment(db, auth, p, request) {
  if(auth.role!=="Owner")return denied();
  const adjustment=await db.prepare("SELECT * FROM adjustment_requests WHERE id=?1 AND business_id=?2").bind(p.id,auth.business_id).first();
  if(!adjustment||adjustment.status!=="pending")return{error:"Pending adjustment not found.",status:404};
  const decision=p.decision==="approved"?"approved":"rejected",now=new Date().toISOString();
  const statements=[db.prepare("UPDATE adjustment_requests SET status=?1,reviewed_by=?2,reviewed_at=?3 WHERE id=?4 AND status='pending'").bind(decision,auth.id,now,adjustment.id)];
  if(decision==="approved"){
    const balance=await stockBalance(db,auth.business_id,adjustment.product_id),next=balance+Number(adjustment.quantity_delta);
    if(next<0)return{error:`Adjustment would make stock negative. Current stock is ${balance}.`};
    statements.push(db.prepare("INSERT INTO inventory_ledger (id,business_id,product_id,event_type,quantity_delta,balance_after,reference_type,reference_id,reason,actor_user_id,approved_by_user_id,created_at) VALUES (?1,?2,?3,?4,?5,?6,'adjustment',?7,?8,?9,?10,?11)")
      .bind(crypto.randomUUID(),auth.business_id,adjustment.product_id,adjustment.reason_code,adjustment.quantity_delta,next,adjustment.id,adjustment.notes,adjustment.requested_by,auth.id,now));
  }
  statements.push(auditStatement(db,auth.business_id,auth.id,decision,"stock_adjustment",adjustment.id,adjustment,{decision},request,now));
  await db.batch(statements);
}

async function create_sale(db, auth, p, request) {
  if(!Array.isArray(p.items)||!p.items.length)return{error:"Sale must contain at least one product."};
  const ids=[...new Set(p.items.map(i=>String(i.productId||"")))];
  const products=[];
  for(const id of ids){const product=await ownedProduct(db,auth,id);if(!product||!product.active)return{error:"A selected product is unavailable."};products.push(product);}
  let subtotal=0,cost=0;const items=[];
  for(const raw of p.items){
    const product=products.find(x=>x.id===raw.productId),qty=toInt(raw.qty);
    if(!product||qty<=0)return{error:"Invalid sale quantity."};
    const balance=await stockBalance(db,auth.business_id,product.id);
    const already=sum(items.filter(i=>i.product.id===product.id),i=>i.qty);
    if(balance<already+qty)return{error:`Only ${balance} ${product.name} in stock.`};
    subtotal+=Number(product.selling_price)*qty;cost+=Number(product.cost_price)*qty;items.push({product,qty,balance});
  }
  const discount=Math.max(0,Number(p.discount||0));
  if(discount>subtotal)return{error:"Discount cannot exceed the subtotal."};
  if(auth.role==="Attendant"&&discount>subtotal*.1)return{error:"Attendant discounts cannot exceed 10%. Owner approval is required."};
  const total=roundMoney(subtotal-discount);
  const payments={cash:roundMoney(p.payments?.cash),orange:roundMoney(p.payments?.orange),afrimoney:roundMoney(p.payments?.afrimoney)};
  if(Math.abs(sum(Object.values(payments))-total)>.009)return{error:"Payment amounts must equal the sale total."};
  const saleId=crypto.randomUUID(),now=new Date().toISOString(),date=now.slice(0,10),statements=[];
  statements.push(db.prepare("INSERT INTO sales (id,business_id,subtotal,discount,total,cash_amount,orange_amount,afrimoney_amount,recorded_by,sale_date,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)")
    .bind(saleId,auth.business_id,roundMoney(subtotal),discount,total,payments.cash,payments.orange,payments.afrimoney,auth.id,date,now));
  const used={};
  for(const item of items){
    used[item.product.id]=(used[item.product.id]||0)+item.qty;
    const after=item.balance-used[item.product.id];
    statements.push(db.prepare("INSERT INTO sale_items (id,sale_id,product_id,product_name,quantity,unit_price,unit_cost) VALUES (?1,?2,?3,?4,?5,?6,?7)")
      .bind(crypto.randomUUID(),saleId,item.product.id,item.product.name,item.qty,item.product.selling_price,item.product.cost_price));
    statements.push(db.prepare("INSERT INTO inventory_ledger (id,business_id,product_id,event_type,quantity_delta,balance_after,reference_type,reference_id,reason,actor_user_id,created_at) VALUES (?1,?2,?3,'sale',?4,?5,'sale',?6,'Sale completed',?7,?8)")
      .bind(crypto.randomUUID(),auth.business_id,item.product.id,-item.qty,after,saleId,auth.id,now));
  }
  statements.push(auditStatement(db,auth.business_id,auth.id,"create","sale",saleId,null,{total,itemCount:items.length,cost},request,now));
  await db.batch(statements);
}

async function create_expense(db,auth,p,request){
  if(!allow(auth,["Owner","Manager"]))return denied();
  const amount=roundMoney(p.amount),category=clean(p.category,40),description=clean(p.description,160),method=clean(p.method,30),date=validDate(p.date)?p.date:new Date().toISOString().slice(0,10);
  if(amount<=0||!category||!description||!method)return{error:"Complete all expense fields."};
  const id=crypto.randomUUID(),now=new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO expenses (id,business_id,category,description,payment_method,amount,expense_date,recorded_by,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(id,auth.business_id,category,description,method,amount,date,auth.id,now),
    auditStatement(db,auth.business_id,auth.id,"create","expense",id,null,{amount,category,description},request,now)
  ]);
}

async function void_expense(db,auth,p,request){
  if(auth.role!=="Owner")return denied();
  const row=await db.prepare("SELECT * FROM expenses WHERE id=?1 AND business_id=?2 AND voided_at IS NULL").bind(p.id,auth.business_id).first();
  if(!row)return{error:"Expense not found.",status:404};const now=new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE expenses SET voided_at=?1,voided_by=?2 WHERE id=?3").bind(now,auth.id,row.id),
    auditStatement(db,auth.business_id,auth.id,"void","expense",row.id,row,{voidedAt:now},request,now)
  ]);
}

async function create_debt(db,auth,p,request){
  if(!allow(auth,["Owner","Manager"]))return denied();
  const customer=clean(p.customer,100),phone=clean(p.phone,30),amount=roundMoney(p.balance),due=p.due,notes=clean(p.notes,300);
  if(!customer||amount<=0||!validDate(due))return{error:"Customer, amount and valid due date are required."};
  const id=crypto.randomUUID(),now=new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO debts (id,business_id,customer_name,customer_phone,original_amount,balance,due_date,notes,created_by,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5,?6,?7,?8,?9,?9)").bind(id,auth.business_id,customer,phone,amount,due,notes,auth.id,now),
    auditStatement(db,auth.business_id,auth.id,"create","debt",id,null,{customer,amount,due},request,now)
  ]);
}

async function update_debt(db,auth,p,request){
  if(!allow(auth,["Owner","Manager"]))return denied();
  const row=await db.prepare("SELECT * FROM debts WHERE id=?1 AND business_id=?2").bind(p.id,auth.business_id).first();
  if(!row)return{error:"Debt not found.",status:404};
  const customer=clean(p.customer,100),phone=clean(p.phone,30),due=p.due,notes=clean(p.notes,300),now=new Date().toISOString();
  if(!customer||!validDate(due))return{error:"Customer and valid due date are required."};
  await db.batch([
    db.prepare("UPDATE debts SET customer_name=?1,customer_phone=?2,due_date=?3,notes=?4,updated_at=?5 WHERE id=?6").bind(customer,phone,due,notes,now,row.id),
    auditStatement(db,auth.business_id,auth.id,"update","debt",row.id,row,{customer,phone,due,notes},request,now)
  ]);
}

async function record_debt_payment(db,auth,p,request){
  if(!allow(auth,["Owner","Manager"]))return denied();
  const debt=await db.prepare("SELECT * FROM debts WHERE id=?1 AND business_id=?2").bind(p.id,auth.business_id).first();
  const amount=roundMoney(p.amount),method=clean(p.method,30);
  if(!debt||amount<=0||amount>Number(debt.balance)||!method)return{error:"Invalid debt payment."};
  const id=crypto.randomUUID(),balance=roundMoney(Number(debt.balance)-amount),now=new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO debt_payments (id,business_id,debt_id,amount,payment_method,recorded_by,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(id,auth.business_id,debt.id,amount,method,auth.id,now),
    db.prepare("UPDATE debts SET balance=?1,updated_at=?2 WHERE id=?3").bind(balance,now,debt.id),
    auditStatement(db,auth.business_id,auth.id,"payment","debt",debt.id,{balance:debt.balance},{balance,amount,method},request,now)
  ]);
}

async function update_business(db,auth,p,request){
  if(auth.role!=="Owner")return denied();
  const current=await db.prepare("SELECT * FROM businesses WHERE id=?1").bind(auth.business_id).first();
  const next={name:clean(p.name,120),type:clean(p.type,80),phone:clean(p.phone,30),address:clean(p.address,180)};
  if(!next.name||!next.type)return{error:"Business name and type are required."};const now=new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE businesses SET name=?1,type=?2,phone=?3,address=?4 WHERE id=?5").bind(next.name,next.type,next.phone,next.address,auth.business_id),
    auditStatement(db,auth.business_id,auth.id,"update","business",auth.business_id,current,next,request,now)
  ]);
}

async function create_user(db,auth,p,request,env){
  if(auth.role!=="Owner")return denied();
  const name=clean(p.name,80),username=normalizeUsername(p.username),phone=clean(p.phone,30),password=String(p.password||""),role=String(p.role||"");
  if(!name||!username||password.length<8||!["Manager","Attendant"].includes(role))return{error:"Name, username, role and an 8-character password are required."};
  const credentials=await hashPassword(password,env.BOOTSTRAP_TOKEN),id=crypto.randomUUID(),now=new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO users (id,business_id,name,username,phone,password_hash,password_salt,password_iterations,role,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)").bind(id,auth.business_id,name,username,phone,credentials.hash,credentials.salt,PASSWORD_ITERATIONS,role,now),
    auditStatement(db,auth.business_id,auth.id,"create","user",id,null,{name,username,phone,role},request,now)
  ]);
}

async function update_user_role(db,auth,p,request){
  if(auth.role!=="Owner")return denied();
  const role=String(p.role||"");if(!["Manager","Attendant"].includes(role))return{error:"Invalid role."};
  const user=await db.prepare("SELECT id,name,username,role,status FROM users WHERE id=?1 AND business_id=?2 AND role!='Owner'").bind(p.id,auth.business_id).first();
  if(!user)return{error:"Staff member not found.",status:404};const now=new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE users SET role=?1 WHERE id=?2").bind(role,user.id),
    auditStatement(db,auth.business_id,auth.id,"role_change","user",user.id,user,{...user,role},request,now)
  ]);
}

async function disable_user(db,auth,p,request){
  if(auth.role!=="Owner")return denied();
  const user=await db.prepare("SELECT id,name,username,role,status FROM users WHERE id=?1 AND business_id=?2 AND role!='Owner'").bind(p.id,auth.business_id).first();
  if(!user)return{error:"Staff member not found.",status:404};const now=new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE users SET status='disabled' WHERE id=?1").bind(user.id),
    db.prepare("DELETE FROM sessions WHERE user_id=?1").bind(user.id),
    auditStatement(db,auth.business_id,auth.id,"disable","user",user.id,user,{...user,status:"disabled"},request,now)
  ]);
}

async function loadState(db,auth){
  const business=await db.prepare("SELECT id,name,type,phone,address FROM businesses WHERE id=?1").bind(auth.business_id).first();
  const productRows=(await db.prepare(`
    SELECT p.*,COALESCE(SUM(l.quantity_delta),0) AS stock
    FROM products p LEFT JOIN inventory_ledger l ON l.product_id=p.id
    WHERE p.business_id=?1 AND p.active=1 GROUP BY p.id ORDER BY p.name
  `).bind(auth.business_id).all()).results;
  const products=productRows.map(p=>({id:p.id,name:p.name,sku:p.sku,category:p.category,stock:Number(p.stock),reorder:Number(p.reorder_level),cost:auth.role==="Attendant"?0:Number(p.cost_price),price:Number(p.selling_price),expiry:p.expiry}));
  const salesRows=(await db.prepare(`
    SELECT s.*,u.name AS user FROM sales s JOIN users u ON u.id=s.recorded_by
    WHERE s.business_id=?1 AND s.status='completed' ORDER BY s.created_at DESC LIMIT 500
  `).bind(auth.business_id).all()).results;
  const sales=[];
  for(const s of salesRows){
    const itemRows=(await db.prepare("SELECT product_id,product_name,quantity,unit_price,unit_cost FROM sale_items WHERE sale_id=?1").bind(s.id).all()).results;
    sales.push({id:s.id,date:s.sale_date,timestamp:Date.parse(s.created_at),items:itemRows.map(i=>({productId:i.product_id,name:i.product_name,qty:Number(i.quantity),price:Number(i.unit_price),cost:auth.role==="Attendant"?0:Number(i.unit_cost)})),subtotal:Number(s.subtotal),discount:Number(s.discount),total:Number(s.total),payments:{cash:Number(s.cash_amount),orange:Number(s.orange_amount),afrimoney:Number(s.afrimoney_amount)},user:s.user});
  }
  let expenses=[],debts=[],users=[],adjustments=[],audits=[];
  if(auth.role!=="Attendant"){
    const rows=(await db.prepare("SELECT e.*,u.name AS user FROM expenses e JOIN users u ON u.id=e.recorded_by WHERE e.business_id=?1 AND e.voided_at IS NULL ORDER BY e.created_at DESC LIMIT 500").bind(auth.business_id).all()).results;
    expenses=rows.map(e=>({id:e.id,date:e.expense_date,timestamp:Date.parse(e.created_at),category:e.category,description:e.description,method:e.payment_method,amount:Number(e.amount),user:e.user}));
    const debtRows=(await db.prepare("SELECT * FROM debts WHERE business_id=?1 ORDER BY updated_at DESC").bind(auth.business_id).all()).results;
    debts=debtRows.map(d=>({id:d.id,customer:d.customer_name,phone:d.customer_phone,original:Number(d.original_amount),balance:Number(d.balance),due:d.due_date,created:d.created_at.slice(0,10),notes:d.notes}));
  }
  if(auth.role==="Owner"){
    const userRows=(await db.prepare("SELECT id,name,username,phone,role,status FROM users WHERE business_id=?1 ORDER BY created_at").bind(auth.business_id).all()).results;
    users=userRows;
    const adjustmentRows=(await db.prepare("SELECT a.*,p.name AS product_name,u.name AS requester FROM adjustment_requests a JOIN products p ON p.id=a.product_id JOIN users u ON u.id=a.requested_by WHERE a.business_id=?1 ORDER BY a.requested_at DESC LIMIT 100").bind(auth.business_id).all()).results;
    adjustments=adjustmentRows.map(a=>({id:a.id,productId:a.product_id,productName:a.product_name,quantityDelta:Number(a.quantity_delta),reasonCode:a.reason_code,notes:a.notes,status:a.status,requester:a.requester,requestedAt:a.requested_at}));
    const auditRows=(await db.prepare("SELECT a.*,u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.business_id=?1 ORDER BY a.created_at DESC LIMIT 100").bind(auth.business_id).all()).results;
    audits=auditRows.map(a=>({id:a.id,action:a.action,entityType:a.entity_type,entityId:a.entity_id,actor:a.actor_name||"System",createdAt:a.created_at}));
  }else{
    users=[publicUser(auth)];
    const adjustmentRows=(await db.prepare("SELECT a.*,p.name AS product_name FROM adjustment_requests a JOIN products p ON p.id=a.product_id WHERE a.business_id=?1 AND a.requested_by=?2 ORDER BY a.requested_at DESC LIMIT 50").bind(auth.business_id,auth.id).all()).results;
    adjustments=adjustmentRows.map(a=>({id:a.id,productId:a.product_id,productName:a.product_name,quantityDelta:Number(a.quantity_delta),reasonCode:a.reason_code,notes:a.notes,status:a.status,requestedAt:a.requested_at}));
  }
  return {business,user:publicUser(auth),users,products,sales,expenses,debts,activities:[],adjustments,audits,secure:true};
}

function validateProduct(p,creating){
  const value={name:clean(p.name,120),sku:clean(p.sku,40).toUpperCase(),category:clean(p.category,80),reorder:Math.max(0,toInt(p.reorder)),cost:roundMoney(p.cost),price:roundMoney(p.price),expiry:String(p.expiry||"")};
  if(!value.name||!value.sku||!value.category||!validDate(value.expiry)||value.cost<0||value.price<0)return{error:"Complete all product fields with valid values."};
  if(creating&&toInt(p.stock)<0)return{error:"Opening stock cannot be negative."};
  return value;
}
async function ownedProduct(db,auth,id){return db.prepare("SELECT * FROM products WHERE id=?1 AND business_id=?2").bind(String(id||""),auth.business_id).first();}
async function stockBalance(db,businessId,productId){const row=await db.prepare("SELECT COALESCE(SUM(quantity_delta),0) AS stock FROM inventory_ledger WHERE business_id=?1 AND product_id=?2").bind(businessId,productId).first();return Number(row?.stock||0);}
function auditStatement(db,businessId,userId,action,entityType,entityId,before,after,request,now){return db.prepare("INSERT INTO audit_logs (id,business_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,ip_address,user_agent,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)").bind(crypto.randomUUID(),businessId,userId,action,entityType,entityId,before?JSON.stringify(before):null,after?JSON.stringify(after):null,request.headers.get("CF-Connecting-IP")||"",clean(request.headers.get("User-Agent"),300),now);}
function allow(auth,roles){return roles.includes(auth.role);}
function denied(){return{error:"You do not have permission to perform this action.",status:403};}
function publicUser(user){return{id:user.id,name:user.name,username:user.username,phone:user.phone||"",role:user.role,status:user.status||"active"};}
function clean(value,max){return String(value||"").trim().replace(/[\u0000-\u001f]/g,"").slice(0,max);}
function normalizeUsername(value){return clean(value,50).toLowerCase().replace(/[^a-z0-9._-]/g,"");}
function toInt(value){const n=Number(value);return Number.isInteger(n)?n:0;}
function roundMoney(value){const n=Number(value||0);return Number.isFinite(n)?Math.round(n*100)/100:0;}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||""))&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`));}
function sum(items,getter=x=>x){return items.reduce((total,item)=>total+Number(getter(item)||0),0);}
async function readJson(request){
  const length=Number(request.headers.get("Content-Length")||0);
  if(length>MAX_JSON_BYTES)return{};
  try{
    const text=await request.text();
    if(new TextEncoder().encode(text).byteLength>MAX_JSON_BYTES)return{};
    return JSON.parse(text);
  }catch{return{};}
}
async function verifyTurnstile(request,env,token,expectedAction){
  const secret=String(env.TURNSTILE_SECRET||"");
  const responseToken=String(token||"");
  const allowedHostnames=String(env.TURNSTILE_HOSTNAMES||"")
    .split(",").map(value=>value.trim().toLowerCase()).filter(Boolean);
  if(!secret||!responseToken||responseToken.length>MAX_TURNSTILE_TOKEN_LENGTH||!allowedHostnames.length){
    console.warn(JSON.stringify({
      message:"Turnstile request rejected before Siteverify",
      action:expectedAction,
      secretConfigured:Boolean(secret),
      tokenPresent:Boolean(responseToken),
      tokenLengthValid:responseToken.length<=MAX_TURNSTILE_TOKEN_LENGTH,
      hostnameAllowlistConfigured:Boolean(allowedHostnames.length)
    }));
    return false;
  }
  try{
    const response=await fetch(TURNSTILE_VERIFY_URL,{
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({
        secret,
        response:responseToken,
        remoteip:request.headers.get("CF-Connecting-IP")||""
      }),
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok){
      console.warn(JSON.stringify({
        message:"Turnstile Siteverify returned an HTTP error",
        action:expectedAction,
        status:response.status
      }));
      return false;
    }
    const result=await response.json();
    const valid=result.success===true
      && result.action===expectedAction
      && allowedHostnames.includes(String(result.hostname||"").toLowerCase());
    if(!valid){
      console.warn(JSON.stringify({
        message:"Turnstile Siteverify rejected a request",
        expectedAction,
        receivedAction:String(result.action||""),
        receivedHostname:String(result.hostname||""),
        success:result.success===true,
        errorCodes:Array.isArray(result["error-codes"])?result["error-codes"].map(String).slice(0,5):[]
      }));
    }
    return valid;
  }catch(error){
    console.warn(JSON.stringify({
      message:"Turnstile verification unavailable",
      action:expectedAction,
      error:error instanceof Error?error.message:String(error)
    }));
    return false;
  }
}
function validOrigin(request,url){const origin=request.headers.get("Origin");return origin===url.origin;}
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers}});}
function secureAssetResponse(response){const headers=new Headers(response.headers);headers.set("X-Content-Type-Options","nosniff");headers.set("Referrer-Policy","strict-origin-when-cross-origin");headers.set("X-Frame-Options","DENY");headers.set("Strict-Transport-Security","max-age=31536000; includeSubDomains");headers.set("Permissions-Policy","camera=(), microphone=(), geolocation=()");headers.set("Content-Security-Policy","default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
function cookieValue(header,name){if(!header)return null;for(const part of header.split(";")){const [key,...rest]=part.trim().split("=");if(key===name)return decodeURIComponent(rest.join("="));}return null;}
function sessionCookie(token,expires){return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expires.toUTCString()}`;}
function expiredCookie(){return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;}
function randomToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));return toBase64Url(bytes);}
async function sha256(value){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return toBase64Url(new Uint8Array(digest));}
async function hashPassword(password,pepper){const salt=crypto.getRandomValues(new Uint8Array(16));const hash=await derivePassword(password,salt,PASSWORD_ITERATIONS,pepper);return{salt:toBase64Url(salt),hash:toBase64Url(hash)};}
async function verifyPassword(password,salt,expected,iterations,pepper){const hash=await derivePassword(password,fromBase64Url(salt),Number(iterations),pepper);return timingSafeEqual(toBase64Url(hash),expected);}
async function derivePassword(password,salt,iterations,pepper){if(!pepper)throw new Error("Password pepper is unavailable.");const material=`${pepper}\u0000${password}`;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(material),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},key,256);return new Uint8Array(bits);}
function toBase64Url(bytes){let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function fromBase64Url(value){const base=value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4);const binary=atob(base);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function timingSafeEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
