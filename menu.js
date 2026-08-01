(() => {
  const money=value=>`NLE ${Number(value||0).toLocaleString("en-SL",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const params=new URLSearchParams(location.search);
  const businessId=params.get("business")||"";
  let data=null;
  const cart=new Map();
  const $=selector=>document.querySelector(selector);

  async function init(){
    try{
      const response=await fetch(`/api/public-menu?business=${encodeURIComponent(businessId)}`);
      data=await response.json();
      if(!response.ok)throw new Error(data.error||"Menu unavailable.");
      $("#businessName").textContent=data.business.name;
      $("#businessAddress").textContent=data.business.address||"";
      renderMenu();
      renderOrder();
    }catch(error){$("#notice").textContent=error.message;$("#menuItems").innerHTML="";}
  }
  function renderMenu(){
    const groups={};
    data.items.forEach(item=>(groups[item.category]??=[]).push(item));
    $("#menuItems").innerHTML=Object.entries(groups).map(([category,items])=>`
      <section class="menu-group"><h2>${escapeHtml(category)}</h2><div class="menu-items-grid">${items.map(item=>`
        <button class="menu-card" data-add="${item.id}"><strong>${escapeHtml(item.name)}</strong><small>${item.stock} available</small><span>${money(item.price)}</span></button>`).join("")}</div></section>`).join("")||'<p class="empty">No menu items are available right now.</p>';
    document.querySelectorAll("[data-add]").forEach(button=>button.addEventListener("click",()=>{
      const item=data.items.find(row=>row.id===button.dataset.add);
      cart.set(item.id,Math.min(item.stock,(cart.get(item.id)||0)+1));
      renderOrder();
    }));
  }
  function renderOrder(){
    const lines=[...cart].map(([id,qty])=>({item:data.items.find(row=>row.id===id),qty}));
    $("#orderItems").innerHTML=lines.length?lines.map(({item,qty})=>`<div class="order-line"><span>${qty} × ${escapeHtml(item.name)}</span><button data-remove="${item.id}">Remove</button></div>`).join(""):'<p class="empty">Your order is empty.</p>';
    document.querySelectorAll("[data-remove]").forEach(button=>button.addEventListener("click",()=>{cart.delete(button.dataset.remove);renderOrder();}));
    $("#orderTotal").textContent=money(lines.reduce((total,line)=>total+line.item.price*line.qty,0));
    $("#sendOrder").disabled=!lines.length;
  }
  $("#orderType").addEventListener("change",()=>{$("#tableField").hidden=$("#orderType").value!=="dine_in";});
  $("#sendOrder").addEventListener("click",()=>{
    const name=$("#customerName").value.trim(),phone=$("#customerPhone").value.trim();
    if(!name||!phone)return alert("Enter your name and phone number.");
    const restaurantPhone=String(data.business.phone||"").replace(/\D/g,"");
    if(!restaurantPhone)return alert("This restaurant has not configured WhatsApp ordering yet.");
    const type=$("#orderType").selectedOptions[0].textContent;
    const lines=[`Hello ${data.business.name}, I would like to order:`,"",...[...cart].map(([id,qty])=>{const item=data.items.find(row=>row.id===id);return`${qty} × ${item.name} — ${money(item.price*qty)}`;}),"",`Total: ${$("#orderTotal").textContent}`,`Order type: ${type}`,`Customer: ${name}`,`Phone: ${phone}`];
    if($("#orderType").value==="dine_in"&&$("#tableName").value.trim())lines.push(`Table: ${$("#tableName").value.trim()}`);
    location.href=`https://wa.me/${restaurantPhone}?text=${encodeURIComponent(lines.join("\n"))}`;
  });
  init();
})();
