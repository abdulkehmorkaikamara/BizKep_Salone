(() => {
  "use strict";

  const STORAGE_KEY = "bizkep-data-v1";
  const DAY = 86400000;
  const now = new Date();
  const isoDate = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const daysAgo = n => isoDate(new Date(Date.now() - n * DAY));
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const money = value => `NLE ${Number(value || 0).toLocaleString("en-SL", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  const shortMoney = value => `NLE ${Number(value || 0).toLocaleString("en-SL", {maximumFractionDigits: 0})}`;
  const escapeHtml = text => String(text ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const isOverdue = date => date < isoDate();
  const initials = name => name.split(/\s+/).map(word => word[0]).join("").slice(0, 2).toUpperCase();
  const formatDate = date => new Intl.DateTimeFormat("en-GB", {day:"numeric", month:"short", year:"numeric"}).format(new Date(`${date}T12:00:00`));
  const formatTime = timestamp => new Intl.DateTimeFormat("en-GB", {hour:"2-digit", minute:"2-digit"}).format(new Date(timestamp));

  const demoData = () => ({
    business: {name:"Kamara Medicals", type:"Pharmacy / Medicine shop", phone:"+232 76 000 000", address:"Freetown, Sierra Leone"},
    user: {name:"Abdul Kamara", role:"Owner"},
    users: [
      {id:"u1",name:"Abdul Kamara",phone:"+232 76 000 000",role:"Owner"},
      {id:"u2",name:"Mariatu Bangura",phone:"+232 77 245 110",role:"Attendant"}
    ],
    products: [
      {id:"p1", name:"Paracetamol 500mg", sku:"MED-001", category:"Pain relief", stock:42, reorder:20, cost:12, price:20, expiry:daysAgo(-240)},
      {id:"p2", name:"Amoxicillin 500mg", sku:"MED-002", category:"Antibiotics", stock:8, reorder:15, cost:38, price:55, expiry:daysAgo(-145)},
      {id:"p3", name:"Vitamin C 1000mg", sku:"MED-003", category:"Vitamins", stock:31, reorder:10, cost:18, price:30, expiry:daysAgo(-310)},
      {id:"p4", name:"ORS Sachets", sku:"MED-004", category:"Hydration", stock:64, reorder:20, cost:4, price:8, expiry:daysAgo(-420)},
      {id:"p5", name:"Cough Syrup 100ml", sku:"MED-005", category:"Cold & flu", stock:6, reorder:10, cost:33, price:50, expiry:daysAgo(-24)},
      {id:"p6", name:"Artesunate 100mg", sku:"MED-006", category:"Antimalarial", stock:18, reorder:12, cost:55, price:78, expiry:daysAgo(-180)},
      {id:"p7", name:"Blood Pressure Tabs", sku:"MED-007", category:"Prescription", stock:9, reorder:10, cost:70, price:95, expiry:daysAgo(-18)},
      {id:"p8", name:"Hand Sanitizer 250ml", sku:"MED-008", category:"Personal care", stock:26, reorder:8, cost:22, price:35, expiry:daysAgo(-520)},
      {id:"p9", name:"Ibuprofen 400mg", sku:"MED-009", category:"Pain relief", stock:37, reorder:15, cost:14, price:24, expiry:daysAgo(-200)}
    ],
    sales: [
      {id:"s1", date:daysAgo(0), timestamp:Date.now()-52*60000, items:[{productId:"p1",name:"Paracetamol 500mg",qty:3,price:20,cost:12},{productId:"p4",name:"ORS Sachets",qty:5,price:8,cost:4}], subtotal:100, discount:0, total:100, payments:{cash:40,orange:60,afrimoney:0}, user:"Mariatu"},
      {id:"s2", date:daysAgo(0), timestamp:Date.now()-145*60000, items:[{productId:"p6",name:"Artesunate 100mg",qty:2,price:78,cost:55},{productId:"p3",name:"Vitamin C 1000mg",qty:2,price:30,cost:18}], subtotal:216, discount:6, total:210, payments:{cash:100,orange:110,afrimoney:0}, user:"Abdul"},
      {id:"s3", date:daysAgo(0), timestamp:Date.now()-230*60000, items:[{productId:"p8",name:"Hand Sanitizer 250ml",qty:2,price:35,cost:22}], subtotal:70, discount:0, total:70, payments:{cash:70,orange:0,afrimoney:0}, user:"Mariatu"},
      {id:"s4", date:daysAgo(1), timestamp:Date.now()-DAY-60*60000, items:[{productId:"p2",name:"Amoxicillin 500mg",qty:5,price:55,cost:38},{productId:"p1",name:"Paracetamol 500mg",qty:8,price:20,cost:12}], subtotal:435,discount:15,total:420,payments:{cash:220,orange:200,afrimoney:0},user:"Abdul"},
      {id:"s5", date:daysAgo(2), timestamp:Date.now()-2*DAY, items:[{productId:"p4",name:"ORS Sachets",qty:18,price:8,cost:4},{productId:"p9",name:"Ibuprofen 400mg",qty:7,price:24,cost:14}],subtotal:312,discount:12,total:300,payments:{cash:140,orange:0,afrimoney:160},user:"Mariatu"},
      {id:"s6", date:daysAgo(3), timestamp:Date.now()-3*DAY, items:[{productId:"p3",name:"Vitamin C 1000mg",qty:9,price:30,cost:18},{productId:"p5",name:"Cough Syrup 100ml",qty:3,price:50,cost:33}],subtotal:420,discount:0,total:420,payments:{cash:300,orange:120,afrimoney:0},user:"Abdul"},
      {id:"s7", date:daysAgo(4), timestamp:Date.now()-4*DAY, items:[{productId:"p6",name:"Artesunate 100mg",qty:7,price:78,cost:55},{productId:"p7",name:"Blood Pressure Tabs",qty:3,price:95,cost:70}],subtotal:831,discount:31,total:800,payments:{cash:500,orange:300,afrimoney:0},user:"Abdul"},
      {id:"s8", date:daysAgo(5), timestamp:Date.now()-5*DAY, items:[{productId:"p1",name:"Paracetamol 500mg",qty:12,price:20,cost:12},{productId:"p8",name:"Hand Sanitizer 250ml",qty:4,price:35,cost:22}],subtotal:380,discount:0,total:380,payments:{cash:180,orange:100,afrimoney:100},user:"Mariatu"},
      {id:"s9", date:daysAgo(6), timestamp:Date.now()-6*DAY, items:[{productId:"p2",name:"Amoxicillin 500mg",qty:6,price:55,cost:38},{productId:"p9",name:"Ibuprofen 400mg",qty:5,price:24,cost:14}],subtotal:450,discount:0,total:450,payments:{cash:250,orange:200,afrimoney:0},user:"Abdul"},
      {id:"s10", date:daysAgo(10), timestamp:Date.now()-10*DAY, items:[{productId:"p3",name:"Vitamin C 1000mg",qty:10,price:30,cost:18}],subtotal:300,discount:0,total:300,payments:{cash:300,orange:0,afrimoney:0},user:"Mariatu"},
      {id:"s11", date:daysAgo(18), timestamp:Date.now()-18*DAY, items:[{productId:"p4",name:"ORS Sachets",qty:25,price:8,cost:4}],subtotal:200,discount:0,total:200,payments:{cash:100,orange:100,afrimoney:0},user:"Abdul"},
      {id:"s12", date:daysAgo(25), timestamp:Date.now()-25*DAY, items:[{productId:"p6",name:"Artesunate 100mg",qty:4,price:78,cost:55}],subtotal:312,discount:12,total:300,payments:{cash:0,orange:300,afrimoney:0},user:"Abdul"}
    ],
    expenses: [
      {id:"e1",date:daysAgo(0),timestamp:Date.now()-110*60000,category:"Transport",description:"Supplier delivery transport",method:"Cash",amount:45,user:"Abdul"},
      {id:"e2",date:daysAgo(0),timestamp:Date.now()-300*60000,category:"Utilities",description:"Shop electricity top-up",method:"Orange Money",amount:80,user:"Abdul"},
      {id:"e3",date:daysAgo(1),timestamp:Date.now()-DAY,category:"Purchases",description:"Medicine restock deposit",method:"Cash",amount:230,user:"Abdul"},
      {id:"e4",date:daysAgo(3),timestamp:Date.now()-3*DAY,category:"Transport",description:"Market transport",method:"Cash",amount:35,user:"Mariatu"},
      {id:"e5",date:daysAgo(6),timestamp:Date.now()-6*DAY,category:"Wages",description:"Weekly attendant allowance",method:"Cash",amount:350,user:"Abdul"},
      {id:"e6",date:daysAgo(12),timestamp:Date.now()-12*DAY,category:"Rent",description:"Monthly shop rent",method:"Bank",amount:900,user:"Abdul"},
      {id:"e7",date:daysAgo(20),timestamp:Date.now()-20*DAY,category:"Utilities",description:"Internet bundle",method:"Afrimoney",amount:120,user:"Abdul"}
    ],
    debts: [
      {id:"d1",customer:"Fatmata Conteh",phone:"+232 77 340 112",original:450,balance:320,due:daysAgo(-3),created:daysAgo(6),notes:"Monthly customer"},
      {id:"d2",customer:"Mohamed Sesay",phone:"+232 76 519 204",original:275,balance:275,due:daysAgo(2),created:daysAgo(9),notes:"Antibiotics and vitamins"},
      {id:"d3",customer:"Hawa Koroma",phone:"+232 78 900 345",original:180,balance:80,due:daysAgo(-7),created:daysAgo(4),notes:"Balance after partial payment"}
    ],
    activities: [
      {id:"a1",type:"payment",title:"Debt payment received",detail:"Fatmata Conteh · Cash",amount:130,timestamp:Date.now()-25*60000}
    ]
  });

  let state = loadData();
  let cart = [];
  let discount = 0;
  let selectedCategory = "All";
  let reportDays = 30;
  let backendAvailable = false;

  function loadData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (parsed && !parsed.users) parsed.users = demoData().users;
      return parsed && parsed.products && parsed.sales ? parsed : demoData();
    } catch (_) {
      return demoData();
    }
  }
  function saveData() {
    if (state.secure) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateSyncStatus();
  }
  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials:"same-origin",
      headers:{"Content-Type":"application/json",...(options.headers||{})},
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The server could not complete this request.");
    return data;
  }
  async function apiAction(action, payload) {
    const result = await api("/api/action", {method:"POST",body:JSON.stringify({action,payload})});
    if (result.state) {
      state = result.state;
      saveData();
      setDateLabels();
      renderAll();
    }
    return result;
  }
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const sum = (items, getter = item => item) => items.reduce((total, item) => total + Number(getter(item) || 0), 0);
  const salesWithin = days => state.sales.filter(sale => (Date.now() - new Date(`${sale.date}T23:59:59`).getTime()) / DAY < days);
  const expensesWithin = days => state.expenses.filter(expense => (Date.now() - new Date(`${expense.date}T23:59:59`).getTime()) / DAY < days);
  const productById = id => state.products.find(product => product.id === id);

  async function init() {
    const authenticated = await establishSession();
    if (!authenticated) return;
    startApplication();
  }
  function startApplication() {
    setDateLabels();
    bindNavigation();
    bindActions();
    renderAll();
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  async function establishSession() {
    try {
      const status = await api("/api/status");
      backendAvailable = true;
      if (!status.configured) {
        renderBootstrap();
        return false;
      }
      try {
        await api("/api/session");
        const result = await api("/api/state");
        state = result.state;
        saveData();
        document.body.classList.add("authenticated");
        return true;
      } catch (error) {
        if (/Authentication required/i.test(error.message)) renderLogin();
        else renderAuthError(error.message);
        return false;
      }
    } catch (error) {
      renderBackendUnavailable(error.message);
      return false;
    }
  }

  function renderLogin() {
    $("#authContent").innerHTML = `
      <h1>Welcome back</h1><p class="auth-copy">Sign in with your individual BizKep account. Never share employee credentials.</p>
      <form class="auth-form" id="loginForm">
        <div class="auth-error" id="authError"></div>
        <label class="field">Username<input name="username" autocomplete="username" required></label>
        <label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="primary-button full" type="submit">Sign in securely</button>
      </form>`;
    $("#loginForm").addEventListener("submit", async event => {
      event.preventDefault();
      const button=event.target.querySelector("button");button.disabled=true;
      try {
        await api("/api/login",{method:"POST",body:JSON.stringify({username:event.target.elements.username.value,password:event.target.elements.password.value})});
        location.reload();
      } catch(error) {
        showAuthFormError(error.message);button.disabled=false;
      }
    });
  }

  function renderBootstrap() {
    $("#authContent").innerHTML = `
      <h1>Secure your business</h1><p class="auth-copy">Create the first owner account. This account approves stock adjustments and manages staff access.</p>
      <form class="auth-form" id="bootstrapForm">
        <div class="auth-error" id="authError"></div>
        <label class="field">Business name<input name="businessName" required></label>
        <label class="field">Owner’s full name<input name="name" autocomplete="name" required></label>
        <label class="field">Owner username<input name="username" autocomplete="username" pattern="[A-Za-z0-9._-]+" required></label>
        <label class="field">One-time setup code<input name="setupToken" type="password" autocomplete="off" required></label>
        <label class="field">Strong password<input name="password" type="password" minlength="10" autocomplete="new-password" required></label>
        <label class="field">Confirm password<input name="confirm" type="password" minlength="10" autocomplete="new-password" required></label>
        <button class="primary-button full" type="submit">Create owner workspace</button>
      </form>`;
    $("#bootstrapForm").addEventListener("submit",async event=>{
      event.preventDefault();const f=event.target.elements;
      if(f.password.value!==f.confirm.value)return showAuthFormError("Passwords do not match.");
      const button=event.target.querySelector("button");button.disabled=true;
      try{
        await api("/api/bootstrap",{method:"POST",body:JSON.stringify({businessName:f.businessName.value,name:f.name.value,username:f.username.value,setupToken:f.setupToken.value,password:f.password.value})});
        location.reload();
      }catch(error){showAuthFormError(error.message);button.disabled=false;}
    });
  }

  function renderBackendUnavailable(message) {
    $("#authContent").innerHTML = `<h1>Secure setup required</h1><p class="auth-copy">BizKep’s secure database has not been connected yet. The previous browser-only mode is disabled because it cannot protect stock records from tampering.</p><div class="auth-error visible">${escapeHtml(message)}</div>`;
  }
  function renderAuthError(message) {$("#authContent").innerHTML=`<h1>Unable to sign in</h1><div class="auth-error visible">${escapeHtml(message)}</div>`;}
  function showAuthFormError(message){const box=$("#authError");box.textContent=message;box.classList.add("visible");}

  function setDateLabels() {
    const hour = now.getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    $(".page-heading h1").textContent = `${greeting}, ${state.user.name.split(" ")[0]}`;
    $("#todayLabel").textContent = `TODAY · ${new Intl.DateTimeFormat("en-GB",{weekday:"long"}).format(now).toUpperCase()}`;
    $("#fullDate").textContent = new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"long",year:"numeric"}).format(now);
  }

  function bindNavigation() {
    $$("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
    $$("[data-go]").forEach(button => button.addEventListener("click", () => showView(button.dataset.go)));
    $("#settingsButton").addEventListener("click", () => showView("settings"));
    $("#menuButton").addEventListener("click", toggleMenu);
    $("#mobileOverlay").addEventListener("click", toggleMenu);
  }
  function showView(name) {
    $$(".view").forEach(view => view.classList.toggle("active", view.id === `${name}View`));
    $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === name));
    if (name === "sales") renderSaleProducts();
    if (name === "inventory") renderInventory();
    if (name === "reports") renderReports();
    window.scrollTo({top:0,behavior:"smooth"});
    if ($("#sidebar").classList.contains("open")) toggleMenu();
  }
  function toggleMenu() {
    $("#sidebar").classList.toggle("open");
    $("#mobileOverlay").classList.toggle("open");
  }

  function bindActions() {
    $("#productSearch").addEventListener("input", renderSaleProducts);
    $("#inventorySearch").addEventListener("input", renderInventory);
    $("#inventoryFilter").addEventListener("change", renderInventory);
    $("#clearCartButton").addEventListener("click", clearCart);
    $("#checkoutButton").addEventListener("click", openCheckout);
    $("#discountButton").addEventListener("click", addDiscount);
    $("#addProductButton").addEventListener("click", () => openProductModal());
    $("#addExpenseButton").addEventListener("click", openExpenseModal);
    $("#addDebtButton").addEventListener("click", openDebtModal);
    $("#addUserButton").addEventListener("click", openUserModal);
    $("#exportButton").addEventListener("click", exportReport);
    $("#downloadBackupButton").addEventListener("click", downloadBackup);
    $("#resetDemoButton").addEventListener("click", resetDemo);
    $("#logoutButton").addEventListener("click", logout);
    $("#businessForm").addEventListener("submit", saveBusinessProfile);
    $("#closeModal").addEventListener("click", closeModal);
    $("#modalBackdrop").addEventListener("click", event => { if (event.target === $("#modalBackdrop")) closeModal(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });
    $("#reportRange").addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button) return;
      reportDays = Number(button.dataset.range);
      $$("#reportRange button").forEach(item => item.classList.toggle("active", item === button));
      renderReports();
    });
    $("#notificationButton").addEventListener("click", () => {
      showView("dashboard");
      $("#alertList").scrollIntoView({behavior:"smooth", block:"center"});
    });
  }

  function renderAll() {
    $("#businessNameHeader").textContent = state.business.name;
    $(".profile-card strong").textContent = state.user.name;
    $(".profile-card small").textContent = state.user.role;
    $(".profile-card .avatar").textContent = initials(state.user.name);
    applyRoleVisibility();
    const form = $("#businessForm");
    if (form) {
      form.elements.name.value = state.business.name;
      form.elements.type.value = state.business.type;
      form.elements.phone.value = state.business.phone;
      form.elements.address.value = state.business.address;
    }
    renderDashboard();
    renderSaleProducts();
    renderCart();
    renderInventory();
    renderExpenses();
    renderDebts();
    renderReports();
    renderTeam();
    renderApprovals();
    renderAudit();
    updateBadges();
  }

  function applyRoleVisibility() {
    const owner=state.user.role==="Owner",manager=state.user.role==="Manager",attendant=state.user.role==="Attendant";
    $$('[data-view="expenses"],[data-view="debts"],[data-view="reports"]').forEach(el=>el.classList.toggle("secure-hidden",attendant));
    $("#settingsButton").classList.toggle("secure-hidden",!owner);
    $("#addProductButton").classList.toggle("secure-hidden",attendant);
    $("#addExpenseButton").classList.toggle("secure-hidden",attendant);
    $("#addDebtButton").classList.toggle("secure-hidden",attendant);
    $("#businessForm").querySelector("button").disabled=!owner;
    $(".team-settings").classList.toggle("secure-hidden",!owner);
    $("#adjustmentPanel").classList.toggle("secure-hidden",!owner);
    $("#auditPanel").classList.toggle("secure-hidden",!owner);
    $("#resetDemoButton").classList.add("secure-hidden");
    if(manager) $("#addUserButton").classList.add("secure-hidden");
  }

  function renderDashboard() {
    const today = isoDate();
    const todaySales = state.sales.filter(sale => sale.date === today);
    const todayExpenses = state.expenses.filter(expense => expense.date === today);
    const salesTotal = sum(todaySales, sale => sale.total);
    const expenseTotal = sum(todayExpenses, expense => expense.amount);
    const costTotal = sum(todaySales, sale => sum(sale.items, item => item.cost * item.qty));
    const debtTotal = sum(state.debts, debt => debt.balance);
    $("#todaySales").textContent = money(salesTotal);
    $("#salesCount").textContent = `${todaySales.length} transaction${todaySales.length === 1 ? "" : "s"} today`;
    $("#todayExpenses").textContent = money(expenseTotal);
    $("#expenseCount").textContent = `${todayExpenses.length} entr${todayExpenses.length === 1 ? "y" : "ies"} today`;
    $("#todayProfit").textContent = money(salesTotal - costTotal - expenseTotal);
    $("#totalDebt").textContent = money(debtTotal);
    $("#debtCustomers").textContent = `Across ${state.debts.filter(d => d.balance > 0).length} customers`;
    $("#paymentTotal").textContent = money(salesTotal);
    renderSpark(todaySales);
    renderWeeklyChart();
    renderAlerts();
    renderActivities();
    renderPaymentBars(todaySales);
  }

  function renderSpark(todaySales) {
    const bars = todaySales.length ? todaySales.map(sale => Math.max(8, sale.total / Math.max(...todaySales.map(s => s.total)) * 34)) : [9,16,12,22,18,25,15];
    $("#salesSpark").innerHTML = bars.slice(-8).map(height => `<i style="height:${height}px"></i>`).join("");
  }

  function renderWeeklyChart() {
    const daily = Array.from({length:7}, (_, index) => {
      const date = daysAgo(6-index);
      return {date, total:sum(state.sales.filter(sale => sale.date === date), sale => sale.total)};
    });
    const max = Math.max(...daily.map(item => item.total), 1);
    const axisTop = Math.ceil(max / 100) * 100;
    $(".chart-y").innerHTML = [1, .75, .5, .25, 0].map(ratio => `<span>${compactAxis(axisTop * ratio)}</span>`).join("");
    $("#weeklyChart").innerHTML = daily.map((item,index) => `
      <div class="bar-day ${index === 6 ? "today" : ""}" title="${money(item.total)}">
        <div><i style="height:${Math.max(3,item.total/max*165)}px"></i></div>
        <span>${new Intl.DateTimeFormat("en-GB",{weekday:"short"}).format(new Date(`${item.date}T12:00:00`))}</span>
      </div>`).join("");
  }
  function compactAxis(value) {
    if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 ? 1 : 0)}k`;
    return Math.round(value).toLocaleString("en-SL");
  }

  function alertItems() {
    const limit = new Date(Date.now() + 30 * DAY);
    const low = state.products.filter(product => product.stock <= product.reorder).map(product => ({
      type:"low", title:`${product.name} is running low`, detail:`${product.stock} left · Reorder at ${product.reorder}`, action:"Restock", view:"inventory"
    }));
    const expiring = state.products.filter(product => new Date(`${product.expiry}T12:00:00`) <= limit).map(product => ({
      type:"expiry", title:`${product.name} expires soon`, detail:`Expiry: ${formatDate(product.expiry)}`, action:"Review", view:"inventory"
    }));
    const overdue = state.debts.filter(debt => debt.balance > 0 && isOverdue(debt.due)).map(debt => ({
      type:"debt", title:`${debt.customer}'s payment is overdue`, detail:`${money(debt.balance)} · Due ${formatDate(debt.due)}`, action:"Collect", view:"debts"
    }));
    return [...low, ...expiring, ...overdue];
  }

  function renderAlerts() {
    const alerts = alertItems();
    $("#attentionCount").textContent = alerts.length;
    $("#alertList").innerHTML = alerts.length ? alerts.slice(0,4).map(alert => `
      <div class="alert-item">
        <span class="alert-icon ${alert.type}"><svg><use href="#${alert.type === "debt" ? "i-users" : "i-alert"}"/></svg></span>
        <div><strong>${escapeHtml(alert.title)}</strong><p>${escapeHtml(alert.detail)}</p></div>
        <button data-alert-view="${alert.view}">${alert.action}</button>
      </div>`).join("") : `<p class="empty-message">Everything looks good. No items need attention.</p>`;
    $$("[data-alert-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.alertView)));
  }

  function combinedActivities() {
    const sales = state.sales.map(sale => ({type:"sale",title:`Sale ${sale.id.slice(-5).toUpperCase()}`,detail:`${sale.items.length} product${sale.items.length===1?"":"s"} · ${sale.user}`,amount:sale.total,timestamp:sale.timestamp}));
    const expenses = state.expenses.map(expense => ({type:"expense",title:expense.description,detail:`${expense.category} · ${expense.method}`,amount:-expense.amount,timestamp:expense.timestamp}));
    return [...sales,...expenses,...state.activities].sort((a,b)=>b.timestamp-a.timestamp);
  }

  function renderActivities() {
    const activities = combinedActivities().slice(0,5);
    $("#activityList").innerHTML = activities.map(activity => `
      <div class="activity-item">
        <span class="activity-icon ${activity.type}"><svg><use href="#${activity.type==="sale"?"i-cart":activity.type==="expense"?"i-receipt":"i-wallet"}"/></svg></span>
        <div><strong>${escapeHtml(activity.title)}</strong><p>${escapeHtml(activity.detail)} · ${relativeTime(activity.timestamp)}</p></div>
        <span class="activity-amount ${activity.amount<0?"negative":""}">${activity.amount<0?"−":"+"}${money(Math.abs(activity.amount))}</span>
      </div>`).join("");
  }
  function relativeTime(timestamp) {
    const minutes = Math.floor((Date.now()-timestamp)/60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes/60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours/24)}d ago`;
  }

  function renderPaymentBars(sales) {
    const totals = {
      cash:sum(sales,sale=>sale.payments.cash),
      orange:sum(sales,sale=>sale.payments.orange),
      afri:sum(sales,sale=>sale.payments.afrimoney)
    };
    const total = Math.max(sum(Object.values(totals)),1);
    const rows = [["Cash",totals.cash,"cash"],["Orange Money",totals.orange,"orange"],["Afrimoney",totals.afri,"afri"]];
    $("#paymentBars").innerHTML = rows.map(([label,value,type]) => `
      <div><div class="pay-row-top"><span>${label}</span><strong>${money(value)}</strong></div><div class="pay-track"><div class="pay-fill ${type}" style="width:${value/total*100}%"></div></div></div>`).join("");
  }

  function renderSaleProducts() {
    const query = ($("#productSearch")?.value || "").toLowerCase();
    const categories = ["All",...new Set(state.products.map(product=>product.category))];
    if (!categories.includes(selectedCategory)) selectedCategory = "All";
    $("#categoryTabs").innerHTML = categories.map(category => `<button class="${selectedCategory===category?"active":""}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("");
    $$("[data-category]").forEach(button => button.addEventListener("click", () => {selectedCategory=button.dataset.category;renderSaleProducts();}));
    const products = state.products.filter(product => (selectedCategory==="All"||product.category===selectedCategory) && product.name.toLowerCase().includes(query));
    $("#productGrid").innerHTML = products.length ? products.map(product => `
      <button class="product-card" data-add-product="${product.id}" ${product.stock<=0?"disabled":""}>
        <span class="product-visual">${initials(product.name)}</span>
        <strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category)}</small>
        <span class="product-card-footer"><b>${money(product.price)}</b><em class="${product.stock<=product.reorder?"low":""}">${product.stock} in stock</em></span>
      </button>`).join("") : `<p class="empty-message">No matching products.</p>`;
    $$("[data-add-product]").forEach(button => button.addEventListener("click",()=>addToCart(button.dataset.addProduct)));
  }

  function addToCart(productId) {
    const product = productById(productId);
    const existing = cart.find(item=>item.productId===productId);
    if (existing) {
      if (existing.qty >= product.stock) return toast("No more stock available",true);
      existing.qty++;
    } else cart.push({productId,qty:1});
    renderCart();
  }
  function updateCartQty(productId, change) {
    const item = cart.find(line=>line.productId===productId);
    const product = productById(productId);
    if (!item) return;
    if (item.qty+change > product.stock) return toast("No more stock available",true);
    item.qty += change;
    if (item.qty <= 0) cart = cart.filter(line=>line.productId!==productId);
    renderCart();
  }
  function clearCart() {
    if (!cart.length) return;
    cart=[]; discount=0; renderCart(); toast("Current sale cleared");
  }
  function cartSubtotal() { return sum(cart,item=>productById(item.productId).price*item.qty); }
  function cartTotal() { return Math.max(0,cartSubtotal()-discount); }
  function renderCart() {
    $("#cartCount").textContent = `${sum(cart,item=>item.qty)} item${sum(cart,item=>item.qty)===1?"":"s"}`;
    $("#saleNumber").textContent = `#${String(state.sales.length+1).padStart(4,"0")}`;
    $("#cartItems").innerHTML = cart.length ? cart.map(item=>{
      const product=productById(item.productId);
      return `<div class="cart-item"><div><strong>${escapeHtml(product.name)}</strong><p>${money(product.price)} each</p><div class="quantity-control"><button data-qty="${product.id}" data-change="-1">−</button><span>${item.qty}</span><button data-qty="${product.id}" data-change="1">+</button></div></div><span class="cart-line-price">${money(product.price*item.qty)}</span></div>`;
    }).join("") : `<div class="cart-empty"><span class="empty-icon"><svg><use href="#i-cart"/></svg></span><strong>Your sale is empty</strong><p>Select products to add them here.<br>Stock updates after checkout.</p></div>`;
    $$("[data-qty]").forEach(button=>button.addEventListener("click",()=>updateCartQty(button.dataset.qty,Number(button.dataset.change))));
    $("#cartSubtotal").textContent=money(cartSubtotal());
    $("#cartTotal").textContent=money(cartTotal());
    $("#discountButton").textContent=discount?`− ${money(discount)}`:"Add discount";
    $("#checkoutButton").disabled=!cart.length;
    $("#checkoutButton").style.opacity=cart.length?"1":".5";
  }
  function addDiscount() {
    if (!cart.length) return toast("Add a product first",true);
    openModal("SALE DISCOUNT","Add a discount",`
      <form class="modal-form" id="discountForm">
        <label class="field">Discount amount (NLE)<input name="discount" type="number" min="0" max="${cartSubtotal()}" step=".01" value="${discount}" required></label>
        <div class="form-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button class="primary-button" type="submit">Apply discount</button></div>
      </form>`);
    $("#discountForm").addEventListener("submit",event=>{event.preventDefault();discount=Math.min(cartSubtotal(),Number(event.target.elements.discount.value));closeModal();renderCart();});
    bindModalCloseButtons();
  }

  function openCheckout() {
    if (!cart.length) return;
    let method="cash";
    openModal("PAYMENT","Complete sale",`
      <div class="checkout-total"><span>Amount to collect</span><strong>${money(cartTotal())}</strong></div>
      <div class="payment-options"><h3>How did the customer pay?</h3>
        <div class="payment-choice-grid">
          <button class="payment-choice active" data-method="cash">Cash<strong>${money(cartTotal())}</strong></button>
          <button class="payment-choice" data-method="orange">Orange Money<strong>${money(cartTotal())}</strong></button>
          <button class="payment-choice" data-method="afrimoney">Afrimoney<strong>${money(cartTotal())}</strong></button>
          <button class="payment-choice" data-method="split">Split payment<strong>2 methods</strong></button>
        </div>
        <div class="split-fields" id="splitFields">
          <label class="field">Cash (NLE)<input id="splitCash" type="number" min="0" step=".01" value="0"></label>
          <label class="field">Orange Money (NLE)<input id="splitOrange" type="number" min="0" step=".01" value="0"></label>
          <label class="field">Afrimoney (NLE)<input id="splitAfri" type="number" min="0" step=".01" value="0"></label>
        </div>
      </div>
      <div class="modal-form"><button class="primary-button full" id="confirmSale">Confirm payment & sale</button></div>`);
    $$("[data-method]").forEach(button=>button.addEventListener("click",()=>{
      method=button.dataset.method;
      $$("[data-method]").forEach(item=>item.classList.toggle("active",item===button));
      $("#splitFields").classList.toggle("visible",method==="split");
    }));
    $("#confirmSale").addEventListener("click",()=>{
      const total=cartTotal();
      let payments={cash:0,orange:0,afrimoney:0};
      if(method==="cash")payments.cash=total;
      if(method==="orange")payments.orange=total;
      if(method==="afrimoney")payments.afrimoney=total;
      if(method==="split"){
        payments={cash:Number($("#splitCash").value),orange:Number($("#splitOrange").value),afrimoney:Number($("#splitAfri").value)};
        if(Math.abs(sum(Object.values(payments))-total)>.009)return toast(`Split amounts must equal ${money(total)}`,true);
      }
      completeSale(payments);
    });
  }
  async function completeSale(payments) {
    const sale={
      items:cart.map(item=>{const p=productById(item.productId);return{productId:p.id,name:p.name,qty:item.qty,price:p.price,cost:p.cost};}),
      subtotal:cartSubtotal(),discount,total:cartTotal(),payments,user:state.user.name.split(" ")[0]
    };
    const itemCount=sum(sale.items,item=>item.qty);
    try{
      await apiAction("create_sale",{items:sale.items.map(i=>({productId:i.productId,qty:i.qty})),discount:sale.discount,payments});
      cart=[];discount=0;renderCart();
      openModal("SALE COMPLETE","Payment received",`
        <div class="receipt"><span class="success-check"><svg><use href="#i-check"/></svg></span><h3>Sale recorded</h3><p>Stock and today’s totals have been updated securely.</p>
          <div class="receipt-paper"><div><span>${itemCount} item${itemCount===1?"":"s"}</span><span>${formatTime(Date.now())}</span></div><div class="receipt-total"><span>Total paid</span><span>${money(sale.total)}</span></div></div>
          <button class="primary-button full" data-close>Done</button>
        </div>`);
      bindModalCloseButtons();
    }catch(error){toast(error.message,true);}
  }

  function inventoryStatus(product) {
    const expiryDays=(new Date(`${product.expiry}T12:00:00`)-Date.now())/DAY;
    if(product.stock<=product.reorder)return["Low stock","low"];
    if(expiryDays<=30)return["Expiring soon","expiring"];
    return["In stock",""];
  }
  function renderInventory() {
    const query=($("#inventorySearch")?.value||"").toLowerCase();
    const filter=$("#inventoryFilter")?.value||"all";
    const limit=new Date(Date.now()+30*DAY);
    const products=state.products.filter(product=>{
      const matches=product.name.toLowerCase().includes(query)||product.sku.toLowerCase().includes(query);
      const status=filter==="all"||(filter==="low"&&product.stock<=product.reorder)||(filter==="expiring"&&new Date(`${product.expiry}T12:00:00`)<=limit);
      return matches&&status;
    });
    $("#productCount").textContent=state.products.length;
    $("#stockValue").textContent=shortMoney(sum(state.products,p=>p.stock*p.cost));
    $("#lowStockCount").textContent=state.products.filter(p=>p.stock<=p.reorder).length;
    $("#expiryCount").textContent=state.products.filter(p=>new Date(`${p.expiry}T12:00:00`)<=limit).length;
    $("#inventoryTable").innerHTML=products.length?products.map(product=>{
      const [label,status]=inventoryStatus(product);
      return `<tr><td><div class="table-product"><span class="product-visual">${initials(product.name)}</span><div><strong>${escapeHtml(product.name)}</strong><small>${product.sku}</small></div></div></td><td>${escapeHtml(product.category)}</td><td><div class="stock-amount"><strong>${product.stock}</strong><small>Ledger balance · reorder at ${product.reorder}</small></div></td><td>${state.user.role==="Attendant"?"Restricted":money(product.cost)}</td><td><strong>${money(product.price)}</strong></td><td>${formatDate(product.expiry)}</td><td><span class="status-pill ${status}">${label}</span></td><td><button class="row-action" data-adjust-product="${product.id}" title="Request stock adjustment"><svg><use href="#i-box"/></svg></button>${state.user.role==="Attendant"?"":`<button class="row-action adjust-button" data-edit-product="${product.id}" title="Edit product details"><svg><use href="#i-edit"/></svg></button>`}</td></tr>`;
    }).join(""):`<tr><td colspan="8" class="empty-message">No matching products found.</td></tr>`;
    $$("[data-edit-product]").forEach(button=>button.addEventListener("click",()=>openProductModal(productById(button.dataset.editProduct))));
    $$("[data-adjust-product]").forEach(button=>button.addEventListener("click",()=>openAdjustmentModal(productById(button.dataset.adjustProduct))));
  }
  function openProductModal(product=null) {
    const editing=Boolean(product);
    openModal("INVENTORY",editing?"Update product":"Add a product",`
      <form class="modal-form" id="productForm">
        <label class="field">Product name<input name="name" value="${escapeHtml(product?.name||"")}" required></label>
        <div class="form-grid"><label class="field">Category<input name="category" value="${escapeHtml(product?.category||"")}" placeholder="e.g. Antibiotics" required></label><label class="field">SKU / code<input name="sku" value="${escapeHtml(product?.sku||`MED-${String(state.products.length+1).padStart(3,"0")}`)}" required></label></div>
        <div class="form-grid">${editing?`<label class="field">Current stock<input value="${product.stock}" disabled><small>Stock can only change through sales or approved adjustments.</small></label>`:`<label class="field">Opening stock<input name="stock" type="number" min="0" value="0" required></label>`}<label class="field">Low-stock alert at<input name="reorder" type="number" min="0" value="${product?.reorder??5}" required></label></div>
        <div class="form-grid"><label class="field">Cost price (NLE)<input name="cost" type="number" min="0" step=".01" value="${product?.cost??0}" ${state.user.role!=="Owner"?"disabled":""} required></label><label class="field">Selling price (NLE)<input name="price" type="number" min="0" step=".01" value="${product?.price??0}" ${state.user.role!=="Owner"?"disabled":""} required></label></div>
        <label class="field">Expiry date<input name="expiry" type="date" value="${product?.expiry||daysAgo(-365)}" required></label>
        <div class="form-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button class="primary-button" type="submit">${editing?"Save changes":"Add product"}</button></div>
      </form>`);
    $("#productForm").addEventListener("submit",async event=>{
      event.preventDefault();const f=event.target.elements;
      const values={id:product?.id,name:f.name.value.trim(),category:f.category.value.trim(),sku:f.sku.value.trim(),stock:editing?undefined:Number(f.stock.value),reorder:Number(f.reorder.value),cost:Number(f.cost.value),price:Number(f.price.value),expiry:f.expiry.value};
      try{await apiAction(editing?"update_product":"create_product",values);closeModal();toast(editing?"Product details updated":"Product added to inventory");}catch(error){toast(error.message,true);}
    });
    bindModalCloseButtons();
  }

  function openAdjustmentModal(product){
    openModal("STOCK CONTROL",`Request adjustment · ${product.name}`,`
      <form class="modal-form" id="adjustmentForm">
        <div class="checkout-total"><span>Current ledger balance</span><strong>${product.stock}</strong></div>
        <label class="field">Change in quantity<input name="quantityDelta" type="number" step="1" placeholder="Use -10 to remove or 10 to add" required></label>
        <label class="field">Reason<select name="reasonCode"><option value="purchase">New purchase / restock</option><option value="damage">Damaged goods</option><option value="expiry">Expired goods</option><option value="return">Customer or supplier return</option><option value="correction">Count correction</option></select></label>
        <label class="field">Detailed explanation<textarea name="notes" rows="3" minlength="5" placeholder="Explain why the stock should change" required></textarea></label>
        <p class="auth-copy">The stock will not change until the owner approves this request.</p>
        <div class="form-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button class="primary-button" type="submit">Submit for approval</button></div>
      </form>`);
    $("#adjustmentForm").addEventListener("submit",async event=>{
      event.preventDefault();const f=event.target.elements;
      try{await apiAction("request_adjustment",{productId:product.id,quantityDelta:Number(f.quantityDelta.value),reasonCode:f.reasonCode.value,notes:f.notes.value});closeModal();toast("Stock adjustment sent to the owner");}catch(error){toast(error.message,true);}
    });
    bindModalCloseButtons();
  }

  function renderExpenses() {
    const today=isoDate();const month=today.slice(0,7);
    const monthExpenses=state.expenses.filter(e=>e.date.startsWith(month));
    const categories={};monthExpenses.forEach(e=>categories[e.category]=(categories[e.category]||0)+e.amount);
    const largest=Object.entries(categories).sort((a,b)=>b[1]-a[1])[0]||["—",0];
    $("#expenseToday").textContent=money(sum(state.expenses.filter(e=>e.date===today),e=>e.amount));
    $("#expenseMonth").textContent=money(sum(monthExpenses,e=>e.amount));
    $("#largestExpenseCategory").textContent=largest[0];$("#largestExpenseAmount").textContent=money(largest[1]);
    $("#expensesTable").innerHTML=[...state.expenses].sort((a,b)=>b.timestamp-a.timestamp).map(expense=>`
      <tr><td>${formatDate(expense.date)}</td><td><span class="status-pill">${escapeHtml(expense.category)}</span></td><td>${escapeHtml(expense.description)}</td><td>${escapeHtml(expense.method)}</td><td>${escapeHtml(expense.user)}</td><td><strong class="text-danger">${money(expense.amount)}</strong></td><td>${state.user.role==="Owner"?`<button class="row-action" data-delete-expense="${expense.id}" title="Void expense"><svg><use href="#i-close"/></svg></button>`:""}</td></tr>`).join("");
    $$("[data-delete-expense]").forEach(button=>button.addEventListener("click",()=>deleteExpense(button.dataset.deleteExpense)));
  }
  function openExpenseModal() {
    openModal("EXPENSES","Record an expense",`
      <form class="modal-form" id="expenseForm">
        <div class="form-grid"><label class="field">Category<select name="category"><option>Purchases</option><option>Rent</option><option>Utilities</option><option>Transport</option><option>Wages</option><option>Other</option></select></label><label class="field">Amount (NLE)<input name="amount" type="number" min=".01" step=".01" required></label></div>
        <label class="field">Description<input name="description" placeholder="What was this expense for?" required></label>
        <div class="form-grid"><label class="field">Payment method<select name="method"><option>Cash</option><option>Orange Money</option><option>Afrimoney</option><option>Bank</option></select></label><label class="field">Date<input name="date" type="date" value="${isoDate()}" max="${isoDate()}" required></label></div>
        <div class="form-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button class="primary-button" type="submit">Save expense</button></div>
      </form>`);
    $("#expenseForm").addEventListener("submit",async event=>{
      event.preventDefault();const f=event.target.elements;
      try{await apiAction("create_expense",{date:f.date.value,category:f.category.value,description:f.description.value.trim(),method:f.method.value,amount:Number(f.amount.value)});closeModal();toast("Expense recorded");}catch(error){toast(error.message,true);}
    });bindModalCloseButtons();
  }
  async function deleteExpense(id) {
    if(!confirm("Void this expense? The original record will remain in the audit trail."))return;
    try{await apiAction("void_expense",{id});toast("Expense voided and preserved in the audit trail");}catch(error){toast(error.message,true);}
  }

  function renderDebts() {
    const active=state.debts.filter(debt=>debt.balance>0);
    const total=sum(active,d=>d.balance);const overdue=sum(active.filter(d=>isOverdue(d.due)),d=>d.balance);
    $("#debtPageTotal").textContent=money(total);$("#debtPagePeople").textContent=`${active.length} customers with balances`;
    $("#overdueAmount").textContent=`${money(overdue)} overdue`;$("#overdueBar").style.width=`${total?overdue/total*100:0}%`;
    $("#debtGrid").innerHTML=active.length?active.map(debt=>`
      <article class="debt-card"><div class="customer-line"><span class="customer-avatar">${initials(debt.customer)}</span><div><strong>${escapeHtml(debt.customer)}</strong><small>${escapeHtml(debt.phone)}</small></div><button class="row-action" data-edit-debt="${debt.id}"><svg><use href="#i-edit"/></svg></button></div>
        <div class="debt-amount-line"><div><span>Outstanding</span><strong>${money(debt.balance)}</strong></div><span class="due-label ${isOverdue(debt.due)?"overdue":""}">${isOverdue(debt.due)?"Overdue":"Due"} · ${formatDate(debt.due)}</span></div>
        <div class="debt-actions"><button data-pay-debt="${debt.id}">Record payment</button><button data-call="${debt.phone}"><svg><use href="#i-phone"/></svg> Contact</button></div>
      </article>`).join(""):`<p class="empty-message panel">No outstanding customer debts.</p>`;
    $$("[data-pay-debt]").forEach(button=>button.addEventListener("click",()=>openDebtPayment(button.dataset.payDebt)));
    $$("[data-edit-debt]").forEach(button=>button.addEventListener("click",()=>openDebtModal(state.debts.find(d=>d.id===button.dataset.editDebt))));
    $$("[data-call]").forEach(button=>button.addEventListener("click",()=>{location.href=`tel:${button.dataset.call.replace(/\s/g,"")}`;}));
  }
  function openDebtModal(debt=null) {
    const editing=Boolean(debt);
    openModal("CUSTOMER DEBT",editing?"Update customer debt":"Add customer debt",`
      <form class="modal-form" id="debtForm">
        <label class="field">Customer name<input name="customer" value="${escapeHtml(debt?.customer||"")}" required></label>
        <label class="field">Phone number<input name="phone" value="${escapeHtml(debt?.phone||"+232 ")}" required></label>
        <div class="form-grid"><label class="field">${editing?"Outstanding balance":"Amount owed"} (NLE)<input name="balance" type="number" min="0" step=".01" value="${debt?.balance??""}" ${editing?"disabled":""} required></label><label class="field">Due date<input name="due" type="date" value="${debt?.due||daysAgo(-7)}" required></label></div>
        <label class="field">Notes<textarea name="notes" rows="3" placeholder="What did the customer buy?">${escapeHtml(debt?.notes||"")}</textarea></label>
        <div class="form-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button class="primary-button" type="submit">${editing?"Save changes":"Add debt"}</button></div>
      </form>`);
    $("#debtForm").addEventListener("submit",async event=>{
      event.preventDefault();const f=event.target.elements;const balance=Number(f.balance.value);
      const values={id:debt?.id,customer:f.customer.value.trim(),phone:f.phone.value.trim(),balance,due:f.due.value,notes:f.notes.value.trim()};
      try{await apiAction(editing?"update_debt":"create_debt",values);closeModal();toast(editing?"Customer details updated":"Customer debt added");}catch(error){toast(error.message,true);}
    });bindModalCloseButtons();
  }
  function openDebtPayment(id) {
    const debt=state.debts.find(d=>d.id===id);
    openModal("DEBT PAYMENT",`Payment from ${debt.customer}`,`
      <form class="modal-form" id="paymentForm"><div class="checkout-total"><span>Outstanding balance</span><strong>${money(debt.balance)}</strong></div>
        <label class="field">Payment amount (NLE)<input name="amount" type="number" min=".01" max="${debt.balance}" step=".01" required></label>
        <label class="field">Payment method<select name="method"><option>Cash</option><option>Orange Money</option><option>Afrimoney</option><option>Bank</option></select></label>
        <div class="form-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button class="primary-button" type="submit">Record payment</button></div></form>`);
    $("#paymentForm").addEventListener("submit",async event=>{
      event.preventDefault();const amount=Number(event.target.elements.amount.value);
      try{await apiAction("record_debt_payment",{id:debt.id,amount,method:event.target.elements.method.value});closeModal();toast(`${money(amount)} payment recorded`);}catch(error){toast(error.message,true);}
    });bindModalCloseButtons();
  }

  function renderReports() {
    const sales=salesWithin(reportDays),expenses=expensesWithin(reportDays);
    const salesTotal=sum(sales,s=>s.total),expenseTotal=sum(expenses,e=>e.amount);
    const costs=sum(sales,s=>sum(s.items,item=>item.cost*item.qty));
    const profit=salesTotal-costs-expenseTotal;
    $("#reportPeriodLabel").textContent=`Last ${reportDays} days`;
    $("#reportSales").textContent=money(salesTotal);$("#reportTransactions").textContent=`${sales.length} transactions`;
    $("#reportExpenses").textContent=money(expenseTotal);$("#reportProfit").textContent=money(profit);
    $("#profitMargin").textContent=`${salesTotal?Math.round(profit/salesTotal*100):0}% net margin`;
    $("#averageSale").textContent=money(sales.length?salesTotal/sales.length:0);
    renderReportChart();renderTopProducts(sales);
  }
  function renderReportChart() {
    const pointCount=Math.min(reportDays,15);const interval=Math.max(1,Math.floor(reportDays/pointCount));
    const points=Array.from({length:pointCount},(_,index)=>{
      const endDaysAgo=(pointCount-1-index)*interval;const dates=Array.from({length:interval},(__,i)=>daysAgo(endDaysAgo+i));
      return {label:new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short"}).format(new Date(`${dates[0]}T12:00:00`)),sales:sum(state.sales.filter(s=>dates.includes(s.date)),s=>s.total),expenses:sum(state.expenses.filter(e=>dates.includes(e.date)),e=>e.amount)};
    });
    const max=Math.max(...points.flatMap(p=>[p.sales,p.expenses]),1);
    $("#reportChart").innerHTML=points.map(point=>`<div class="report-bar-set" title="Sales ${money(point.sales)} · Expenses ${money(point.expenses)}"><i style="height:${point.sales/max*100}%"></i><i style="height:${point.expenses/max*100}%"></i><span>${point.label}</span></div>`).join("");
  }
  function renderTopProducts(sales) {
    const products={};
    sales.forEach(sale=>sale.items.forEach(item=>{if(!products[item.productId])products[item.productId]={name:item.name,qty:0,value:0};products[item.productId].qty+=item.qty;products[item.productId].value+=item.qty*item.price;}));
    const ranked=Object.values(products).sort((a,b)=>b.qty-a.qty).slice(0,6);
    $("#topProducts").innerHTML=ranked.length?ranked.map((item,index)=>`<div class="rank-item"><span class="rank-number">${index+1}</span><div><strong>${escapeHtml(item.name)}</strong><small>${item.qty} units sold</small></div><div class="rank-value"><b>${money(item.value)}</b><span>revenue</span></div></div>`).join(""):`<p class="empty-message">No sales in this period.</p>`;
  }
  function exportReport() {
    const sales=salesWithin(reportDays);
    const rows=[["Date","Receipt","Products","Total","Cash","Orange Money","Afrimoney","Recorded by"],...sales.map(s=>[s.date,s.id,s.items.map(i=>`${i.name} x${i.qty}`).join("; "),s.total,s.payments.cash,s.payments.orange,s.payments.afrimoney,s.user])];
    const csv=rows.map(row=>row.map(cell=>`"${String(cell).replace(/"/g,'""')}"`).join(",")).join("\n");
    downloadFile(`bizkep-sales-${isoDate()}.csv`,csv,"text/csv");
    toast("Sales report exported");
  }
  function downloadBackup() {
    downloadFile(`bizkep-backup-${isoDate()}.json`,JSON.stringify(state,null,2),"application/json");
    toast("Data backup downloaded");
  }
  function downloadFile(name,content,type) {
    const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([content],{type}));link.download=name;link.click();URL.revokeObjectURL(link.href);
  }
  function resetDemo() {
    toast("Demo reset is disabled in secure mode.",true);
  }
  async function saveBusinessProfile(event) {
    event.preventDefault();const f=event.target.elements;
    try{await apiAction("update_business",{name:f.name.value.trim(),type:f.type.value,phone:f.phone.value.trim(),address:f.address.value.trim()});toast("Business profile saved");}catch(error){toast(error.message,true);}
  }

  function renderTeam() {
    const permissions = {
      Owner:"Full access, staff management, and reports",
      Manager:"Sales, stock, expenses, debts, and reports",
      Attendant:"Sales and stock viewing"
    };
    $("#teamList").innerHTML = state.users.map(user => `
      <div class="team-member">
        <span class="customer-avatar">${initials(user.name)}</span>
        <div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.phone)}</small></div>
        <span class="permission-note">${permissions[user.role]}</span>
        <select class="role-select" data-user-role="${user.id}" ${user.role === "Owner" ? "disabled" : ""}>
          ${user.role === "Owner" ? `<option>Owner</option>` : ["Manager","Attendant"].map(role => `<option ${role===user.role?"selected":""}>${role}</option>`).join("")}
        </select>
        ${user.role === "Owner" ? "" : `<button class="row-action" data-remove-user="${user.id}" aria-label="Remove staff member"><svg><use href="#i-trash"/></svg></button>`}
      </div>`).join("");
    $$("[data-user-role]").forEach(select => select.addEventListener("change", async () => {
      try{await apiAction("update_user_role",{id:select.dataset.userRole,role:select.value});toast("Staff permissions updated");}catch(error){toast(error.message,true);renderTeam();}
    }));
    $$("[data-remove-user]").forEach(button => button.addEventListener("click", async () => {
      if (!confirm("Disable this staff account and sign it out on every device?")) return;
      try{await apiAction("disable_user",{id:button.dataset.removeUser});toast("Staff account disabled");}catch(error){toast(error.message,true);}
    }));
  }

  function openUserModal() {
    openModal("STAFF ACCESS","Add a staff member",`
      <form class="modal-form" id="userForm">
        <label class="field">Full name<input name="name" required></label>
        <label class="field">Username<input name="username" pattern="[A-Za-z0-9._-]+" required></label>
        <label class="field">Phone number<input name="phone" value="+232 " required></label>
        <label class="field">Role<select name="role"><option>Attendant</option><option>Manager</option></select></label>
        <label class="field">Temporary password<input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
        <div class="form-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button class="primary-button" type="submit">Add staff member</button></div>
      </form>`);
    $("#userForm").addEventListener("submit", async event => {
      event.preventDefault(); const f=event.target.elements;
      try{await apiAction("create_user",{name:f.name.value.trim(),username:f.username.value,phone:f.phone.value.trim(),role:f.role.value,password:f.password.value});closeModal();toast("Staff account created");}catch(error){toast(error.message,true);}
    });
    bindModalCloseButtons();
  }

  function renderApprovals(){
    const pending=(state.adjustments||[]).filter(item=>item.status==="pending");
    $("#approvalList").innerHTML=pending.length?pending.map(item=>`
      <div class="approval-item"><span class="alert-icon ${item.quantityDelta<0?"low":"debt"}"><svg><use href="#i-box"/></svg></span><div><strong>${escapeHtml(item.productName)} · ${item.quantityDelta>0?"+":""}${item.quantityDelta}</strong><small>${escapeHtml(item.reasonCode)} · ${escapeHtml(item.requester||"Staff")} · ${escapeHtml(item.notes)}</small></div><div class="approval-actions"><button class="approve" data-review="${item.id}" data-decision="approved">Approve</button><button data-review="${item.id}" data-decision="rejected">Reject</button></div></div>`).join(""):`<p class="empty-message">No stock adjustments await approval.</p>`;
    $$("[data-review]").forEach(button=>button.addEventListener("click",async()=>{
      const decision=button.dataset.decision;
      if(!confirm(`${decision==="approved"?"Approve":"Reject"} this stock adjustment?`))return;
      try{await apiAction("review_adjustment",{id:button.dataset.review,decision});toast(`Adjustment ${decision}`);}catch(error){toast(error.message,true);}
    }));
  }

  function renderAudit(){
    const audits=state.audits||[];
    $("#auditList").innerHTML=audits.length?audits.slice(0,20).map(item=>`<div class="audit-item"><span class="activity-icon payment"><svg><use href="#i-receipt"/></svg></span><div><strong>${escapeHtml(item.actor)} · ${escapeHtml(item.action)} ${escapeHtml(item.entityType)}</strong><small>${new Date(item.createdAt).toLocaleString("en-GB")}</small></div></div>`).join(""):`<p class="empty-message">Audit events will appear here.</p>`;
  }

  async function logout(){
    try{await api("/api/logout",{method:"POST",body:"{}"});}catch(_){}
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }

  function updateBadges() {
    const low=state.products.filter(p=>p.stock<=p.reorder).length;
    const debts=state.debts.filter(d=>d.balance>0).length;
    $("#stockBadge").textContent=low;$("#stockBadge").style.display=low?"grid":"none";
    $("#debtBadge").textContent=debts;$("#debtBadge").style.display=debts?"grid":"none";
  }
  function updateConnection() {
    const online=navigator.onLine;
    $("#connectionPill").classList.toggle("offline",!online);
    $("#connectionPill b").textContent=online?"Online":"Offline";
    $("#syncTitle").textContent=online?"Securely connected":"Read-only offline";
    $("#syncText").textContent=online?"Cloud records and audit controls are active.":"Reconnect before recording transactions.";
  }
  function updateSyncStatus() {
    $("#syncTitle").textContent=navigator.onLine?"Synced just now":"Read-only offline";
    setTimeout(updateConnection,2200);
  }
  function openModal(eyebrow,title,content) {
    $("#modalEyebrow").textContent=eyebrow;$("#modalTitle").textContent=title;$("#modalContent").innerHTML=content;
    $("#modalBackdrop").classList.add("open");document.body.style.overflow="hidden";
  }
  function closeModal() {$("#modalBackdrop").classList.remove("open");document.body.style.overflow="";}
  function bindModalCloseButtons() {$$("[data-close]").forEach(button=>button.addEventListener("click",closeModal));}
  function toast(message,error=false) {
    const element=document.createElement("div");element.className=`toast ${error?"error":""}`;
    element.innerHTML=`<svg><use href="#${error?"i-alert":"i-check"}"/></svg><span>${escapeHtml(message)}</span>`;
    $("#toastRegion").append(element);setTimeout(()=>element.remove(),3200);
  }

  document.addEventListener("DOMContentLoaded",init);
})();
