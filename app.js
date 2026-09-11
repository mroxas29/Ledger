(function(){
  "use strict";
  const STORAGE_KEY = "ledger_transactions_v1";
  const CURRENCY_KEY = "ledger_currency_v1";
  const PASSCODE_KEY = "ledger_passcode_v1";
  const DEFAULT_CATEGORIES = ["Food","Groceries","Transport","Bills","Rent","Shopping","Entertainment","Health","Salary","Freelance","Savings","Other"];

  let transactions = load();
  let currency = localStorage.getItem(CURRENCY_KEY) || "$";
  let viewDate = new Date();
  viewDate.setDate(1);
  let editingId = null;
  let filterState = "all";

  function load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){ return []; }
  }
  function persist(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); }
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function fmt(n){
    const sign = n < 0 ? "-" : "";
    return sign + currency + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function isoDate(d){
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }
  function todayISO(){ return isoDate(new Date()); }
  function monthLabel(d){ return d.toLocaleDateString(undefined, { month:"long", year:"numeric" }); }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
  }
  function dayHeadingLabel(iso){
    const today = todayISO();
    const y = new Date(); y.setDate(y.getDate()-1);
    const yesterday = isoDate(y);
    if(iso === today) return "Today";
    if(iso === yesterday) return "Yesterday";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });
  }

  function entryDateLabel(t){
    const d = new Date(t.date + "T00:00:00");
    const dateStr = d.toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" });
    let timeStr = "";
    if(t.createdAt){
      timeStr = " &middot; logged " + new Date(t.createdAt).toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" });
    }
    return dateStr + timeStr;
  }

  const DAILY_CAP_KEY = "ledger_daily_cap_v1";
  function getDailyCap(){
    const stored = parseFloat(localStorage.getItem(DAILY_CAP_KEY));
    return (stored && stored > 0) ? stored : 500;
  }
  function lerpColor(hexA, hexB, t){
    t = Math.min(Math.max(t, 0), 1);
    const a = hexA.match(/\w\w/g).map(x=> parseInt(x,16));
    const b = hexB.match(/\w\w/g).map(x=> parseInt(x,16));
    const c = a.map((v,i)=> Math.round(v + (b[i]-v)*t));
    return "#" + c.map(v=> v.toString(16).padStart(2,"0")).join("");
  }
  function dailySpendColor(amount){
    return lerpColor("34C77B", "E5484D", amount / getDailyCap());
  }
  function renderDailySpend(){
    const today = todayISO();
    const spend = transactions
      .filter(t=> t.type === "expense" && t.date === today)
      .reduce((s,t)=> s + t.amount, 0);
    const color = dailySpendColor(spend);
    const pct = Math.min((spend / getDailyCap()) * 100, 100);
    document.getElementById("dailySpendAmount").textContent = fmt(spend);
    document.getElementById("dailySpendAmount").style.color = color;
    document.getElementById("dailySpendBar").style.width = pct + "%";
    document.getElementById("dailySpendBar").style.background = color;
  }

  function transactionsForMonth(){
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    return transactions.filter(t=>{
      const d = new Date(t.date + "T00:00:00");
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }

  function render(){
    renderDailySpend();
    document.getElementById("monthLabel").textContent = monthLabel(viewDate);
    const monthTx = transactionsForMonth();
    let income = 0, expense = 0;
    monthTx.forEach(t=> t.type === "income" ? income += t.amount : expense += t.amount);
    const balance = income - expense;
    const balEl = document.getElementById("balanceLabel");
    balEl.textContent = fmt(balance);
    balEl.classList.toggle("negative", balance < 0);
    document.getElementById("incomeTotal").textContent = fmt(income);
    document.getElementById("expenseTotal").textContent = fmt(expense);

    const maxIE = Math.max(income, expense, 1);
    document.getElementById("qgIncomeBar").style.width = (income/maxIE*100) + "%";
    document.getElementById("qgExpenseBar").style.width = (expense/maxIE*100) + "%";

    let listTx = monthTx;
    if(filterState === "income") listTx = monthTx.filter(t=>t.type==="income");
    else if(filterState === "expense") listTx = monthTx.filter(t=>t.type==="expense");

    const filteredTotal = listTx.reduce((s,t)=> s + (t.type==="income" ? t.amount : -t.amount), 0);
    const totalLabel = filterState === "income" ? "Total income" : filterState === "expense" ? "Total expenses" : "Net total";
    document.getElementById("listTotal").innerHTML = `<span>${totalLabel}</span><span>${fmt(filterState==="expense" ? Math.abs(filteredTotal) : filteredTotal)}</span>`;

    const byDate = {};
    listTx.forEach(t=>{ (byDate[t.date] = byDate[t.date] || []).push(t); });
    const dates = Object.keys(byDate).sort().reverse();

    const list = document.getElementById("list");
    list.innerHTML = "";

    if(dates.length === 0){
      list.innerHTML = `<div class="empty-state"><span class="big">Nothing logged yet</span>Tap the + button to add your first income or expense for this month.</div>`;
      return;
    }

    dates.forEach(dateKey=>{
      const items = byDate[dateKey].sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));
      let dayNet = 0;
      items.forEach(t=> dayNet += (t.type === "income" ? t.amount : -t.amount));

      const group = document.createElement("div");
      group.className = "day-group";
      const heading = document.createElement("div");
      heading.className = "day-heading";
      heading.innerHTML = `<span>${dayHeadingLabel(dateKey)}</span><span class="day-total">${fmt(dayNet)}</span>`;
      group.appendChild(heading);

      items.forEach(t=>{
        const row = document.createElement("div");
        row.className = "entry";
        row.innerHTML = `
          <span class="entry-dot ${t.type}"></span>
          <span class="entry-main">
            <div class="entry-cat">${escapeHtml(t.category)}</div>
            <div class="entry-note">${entryDateLabel(t)}${t.note ? " &middot; " + escapeHtml(t.note) : ""}</div>
          </span>
          <span class="entry-amt ${t.type}">${t.type === "expense" ? "-" : "+"}${currency}${t.amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</span>
        `;
        row.addEventListener("click", ()=> openSheet(t.id));
        group.appendChild(row);
      });
      list.appendChild(group);
    });
  }

  // ---------- Filter tabs ----------
  document.querySelectorAll("#filterTabs button").forEach(b=>{
    b.addEventListener("click", ()=>{
      filterState = b.dataset.filter;
      document.querySelectorAll("#filterTabs button").forEach(x=> x.classList.toggle("active", x===b));
      render();
    });
  });

  // ---------- Sheet (add/edit) ----------
  const sheet = document.getElementById("sheet");
  const overlay = document.getElementById("overlay");
  const amountInput = document.getElementById("amountInput");
  const categoryInput = document.getElementById("categoryInput");
  const noteInput = document.getElementById("noteInput");
  const dateInput = document.getElementById("dateInput");
  const deleteBtn = document.getElementById("deleteBtn");
  const currencySymbolEl = document.getElementById("currencySymbol");

  function formatAmountTyping(){
    let v = amountInput.value;
    v = v.replace(/[^\d.]/g,"");
    const firstDot = v.indexOf(".");
    if(firstDot !== -1){ v = v.slice(0,firstDot+1) + v.slice(firstDot+1).replace(/\./g,""); }
    let parts = v.split(".");
    let intPart = parts[0] || "";
    let decPart = parts.length > 1 ? parts[1].slice(0,2) : undefined;
    intPart = intPart.replace(/^0+(?=\d)/, "");
    let formattedInt = intPart ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "";
    let result = formattedInt;
    if(decPart !== undefined) result += "." + decPart;
    else if(v.endsWith(".")) result += ".";
    amountInput.value = result;
  }
  amountInput.addEventListener("input", formatAmountTyping);

  function refreshCategoryList(){
    const used = Array.from(new Set(transactions.map(t=>t.category)));
    const all = Array.from(new Set([...DEFAULT_CATEGORIES, ...used]));
    document.getElementById("categoryList").innerHTML = all.map(c=>`<option value="${escapeHtml(c)}">`).join("");
  }

  function setType(type){
    document.querySelectorAll(".type-toggle button").forEach(b=> b.classList.toggle("active", b.dataset.type === type));
    sheet.dataset.type = type;
  }

  function openSheet(id){
    editingId = id || null;
    currencySymbolEl.textContent = currency;
    refreshCategoryList();
    if(id){
      const t = transactions.find(x=>x.id === id);
      setType(t.type);
      amountInput.value = String(t.amount);
      formatAmountTyping();
      categoryInput.value = t.category;
      noteInput.value = t.note || "";
      dateInput.value = t.date;
      deleteBtn.style.display = "block";
    } else {
      setType("expense");
      amountInput.value = "";
      categoryInput.value = "";
      noteInput.value = "";
      const now = new Date();
      dateInput.value = (viewDate.getMonth() === now.getMonth() && viewDate.getFullYear() === now.getFullYear()) ? isoDate(now) : isoDate(viewDate);
      deleteBtn.style.display = "none";
    }
    overlay.classList.add("show");
    sheet.classList.add("show");
    setTimeout(()=> amountInput.focus(), 250);
  }
  function closeSheet(){
    overlay.classList.remove("show");
    sheet.classList.remove("show");
    editingId = null;
  }

  document.querySelectorAll(".type-toggle button").forEach(b=> b.addEventListener("click", ()=> setType(b.dataset.type)));
  document.getElementById("fab").addEventListener("click", ()=> openSheet(null));
  overlay.addEventListener("click", ()=>{ closeSheet(); closeMenu(); });

  document.getElementById("saveBtn").addEventListener("click", ()=>{
    const amount = parseFloat(amountInput.value.replace(/,/g,""));
    const category = categoryInput.value.trim();
    const date = dateInput.value;
    const type = sheet.dataset.type || "expense";
    if(!amount || amount <= 0){ toast("Enter an amount"); amountInput.focus(); return; }
    if(!category){ toast("Enter a category"); categoryInput.focus(); return; }
    if(!date){ toast("Pick a date"); return; }

    if(editingId){
      const t = transactions.find(x=>x.id === editingId);
      Object.assign(t, { amount, category, date, type, note: noteInput.value.trim() });
    } else {
      transactions.push({ id: uid(), amount, category, date, type, note: noteInput.value.trim(), createdAt: Date.now() });
    }
    persist();
    viewDate = new Date(date + "T00:00:00"); viewDate.setDate(1);
    render();
    closeSheet();
    toast("Saved");
  });

  deleteBtn.addEventListener("click", ()=>{
    if(!editingId) return;
    if(!confirm("Delete this entry? This can't be undone.")) return;
    transactions = transactions.filter(t=>t.id !== editingId);
    persist();
    render();
    closeSheet();
    toast("Deleted");
  });

  document.getElementById("prevMonth").addEventListener("click", ()=>{ viewDate.setMonth(viewDate.getMonth()-1); render(); });
  document.getElementById("nextMonth").addEventListener("click", ()=>{ viewDate.setMonth(viewDate.getMonth()+1); render(); });

  // ---------- Menu ----------
  const menuSheet = document.getElementById("menuSheet");
  const menuPanel = document.getElementById("menuPanel");
  const menuOverlay = document.getElementById("menuOverlay");
  menuPanel.style.cssText = "position:fixed;left:0;right:0;bottom:0;background:var(--bg);border-radius:20px 20px 0 0;padding:20px 20px calc(24px + var(--safe-bottom));transform:translateY(105%);transition:transform .28s cubic-bezier(.32,.72,0,1);z-index:11;";
  menuOverlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.4);opacity:0;pointer-events:none;transition:opacity .22s ease;z-index:10;";
  menuSheet.style.display = "block";
  document.getElementById("currencySelect").value = currency;
  document.getElementById("dailyCapInput").value = getDailyCap();

  function openMenu(){ menuOverlay.style.opacity = "1"; menuOverlay.style.pointerEvents = "auto"; menuPanel.style.transform = "translateY(0)"; }
  function closeMenu(){ menuOverlay.style.opacity = "0"; menuOverlay.style.pointerEvents = "none"; menuPanel.style.transform = "translateY(105%)"; }
  document.getElementById("menuBtn").addEventListener("click", openMenu);
  menuOverlay.addEventListener("click", closeMenu);

  document.getElementById("currencySelect").addEventListener("change", (e)=>{
    currency = e.target.value;
    localStorage.setItem(CURRENCY_KEY, currency);
    render();
  });

  document.getElementById("dailyCapInput").addEventListener("change", (e)=>{
    const val = parseFloat(e.target.value);
    if(!val || val <= 0){
      e.target.value = getDailyCap();
      toast("Enter a cap above 0");
      return;
    }
    localStorage.setItem(DAILY_CAP_KEY, val);
    renderDailySpend();
    toast("Daily cap updated");
  });

  document.getElementById("exportBtn").addEventListener("click", ()=>{
    const monthTx = transactionsForMonth().sort((a,b)=> a.date.localeCompare(b.date));
    if(monthTx.length === 0){ toast("Nothing to export"); return; }
    let csv = "Date,Type,Category,Note,Amount\n";
    monthTx.forEach(t=>{
      const row = [t.date, t.type, t.category, (t.note||"").replace(/,/g," "), t.amount.toFixed(2)];
      csv += row.join(",") + "\n";
    });
    const blob = new Blob([csv], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-${viewDate.getFullYear()}-${String(viewDate.getMonth()+1).padStart(2,"0")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    closeMenu();
  });

  document.getElementById("clearBtn").addEventListener("click", ()=>{
    if(confirm("Delete all logged transactions? This can't be undone.")){
      transactions = [];
      persist();
      render();
      closeMenu();
      toast("All data cleared");
    }
  });

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg){
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> el.classList.remove("show"), 1600);
  }

  // ---------- Pages (ledger / dashboard) ----------
  function showPage(name){
    document.getElementById("ledgerPage").style.display = name === "ledger" ? "flex" : "none";
    document.getElementById("dashboardPage").style.display = name === "dashboard" ? "flex" : "none";
    if(name === "dashboard") renderDashboard();
  }
  document.getElementById("dashBtn").addEventListener("click", ()=> showPage("dashboard"));
  document.getElementById("dashBackBtn").addEventListener("click", ()=> showPage("ledger"));

  let dashRange = "1y";
  document.querySelectorAll("#rangeTabs button").forEach(b=>{
    b.addEventListener("click", ()=>{
      dashRange = b.dataset.range;
      document.querySelectorAll("#rangeTabs button").forEach(x=> x.classList.toggle("active", x===b));
      renderDashboard();
    });
  });

  function monthsBack(n){
    const list = [];
    const d = new Date(); d.setDate(1);
    for(let i=0;i<n;i++){
      list.push({ year:d.getFullYear(), month:d.getMonth() });
      d.setMonth(d.getMonth()-1);
    }
    return list;
  }
  function computeMonthTotals(year, month){
    let income=0, expense=0;
    transactions.forEach(t=>{
      const dt = new Date(t.date+"T00:00:00");
      if(dt.getFullYear()===year && dt.getMonth()===month){
        if(t.type==="income") income+=t.amount; else expense+=t.amount;
      }
    });
    return { income, expense };
  }

  function renderDashboard(){
    let monthsList;
    if(dashRange === "all"){
      if(transactions.length === 0){
        monthsList = monthsBack(1);
      } else {
        const times = transactions.map(t=> new Date(t.date+"T00:00:00").getTime());
        const minDate = new Date(Math.min(...times));
        const now = new Date(); now.setDate(1);
        const start = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        const totalMonths = (now.getFullYear()-start.getFullYear())*12 + (now.getMonth()-start.getMonth()) + 1;
        monthsList = monthsBack(Math.max(totalMonths,1));
      }
    } else {
      monthsList = monthsBack(dashRange === "1y" ? 12 : 24);
    }

    let totalIncome = 0, totalExpense = 0;
    const dashList = document.getElementById("dashList");
    dashList.innerHTML = "";
    let currentYear = null;

    monthsList.forEach(({year,month})=>{
      const { income, expense } = computeMonthTotals(year, month);
      totalIncome += income; totalExpense += expense;
      if(year !== currentYear){
        currentYear = year;
        const yh = document.createElement("div");
        yh.className = "dash-year-heading";
        yh.textContent = String(year);
        dashList.appendChild(yh);
      }
      const max = Math.max(income, expense, 1);
      const monthName = new Date(year, month, 1).toLocaleDateString(undefined, { month:"long" });
      const row = document.createElement("div");
      row.className = "dash-month-row";
      row.innerHTML = `
        <div class="dash-month-top">
          <span class="dash-month-name">${monthName}</span>
          <span class="dash-month-net">${fmt(income-expense)}</span>
        </div>
        <div class="dash-bars"><div class="dash-bar income" style="width:${(income/max*100)}%"></div></div>
        <div class="dash-bars"><div class="dash-bar expense" style="width:${(expense/max*100)}%"></div></div>
      `;
      row.addEventListener("click", ()=>{
        viewDate = new Date(year, month, 1);
        showPage("ledger");
        render();
      });
      dashList.appendChild(row);
    });

    document.getElementById("dashBalance").textContent = fmt(totalIncome-totalExpense);
    document.getElementById("dashIncome").textContent = fmt(totalIncome);
    document.getElementById("dashExpense").textContent = fmt(totalExpense);
  }

  // ---------- Passcode lock ----------
  function getPasscode(){ return localStorage.getItem(PASSCODE_KEY) || "46334"; }

  let lockMode = "unlock";
  let lockBuffer = "";
  let pendingNewPasscode = "";

  function renderLockDots(){
    document.getElementById("lockDots").innerHTML = lockBuffer.length
      ? lockBuffer.split("").map(()=> `<span class="dot"></span>`).join("")
      : `&nbsp;`;
  }
  function showLockError(msg){
    document.getElementById("lockError").textContent = msg;
    lockBuffer = "";
    renderLockDots();
    const card = document.getElementById("lockCard");
    card.classList.add("shake");
    setTimeout(()=> card.classList.remove("shake"), 400);
    setTimeout(()=>{ document.getElementById("lockError").textContent = ""; }, 2200);
  }
  function showLockScreen(mode){
    lockMode = mode;
    lockBuffer = "";
    document.getElementById("lockScreen").classList.remove("hidden");
    const titles = { unlock:"Enter passcode", verifyOld:"Enter current passcode", setNew:"Enter new passcode (min 4 digits)", confirmNew:"Re-enter new passcode" };
    document.getElementById("lockTitle").textContent = titles[mode];
    document.getElementById("keypadDone").style.display = "none";
    document.getElementById("lockError").textContent = "";
    renderLockDots();
  }
  function handleLockSubmit(){
    if(lockMode === "unlock"){
      if(lockBuffer === getPasscode()){
        document.getElementById("lockScreen").classList.add("hidden");
      } else { showLockError("Incorrect passcode"); }
    } else if(lockMode === "verifyOld"){
      if(lockBuffer === getPasscode()){
        showLockScreen("setNew");
      } else { showLockError("Incorrect passcode"); }
    }
  }
  function keypadPress(d){
    lockBuffer += d;
    renderLockDots();
    if((lockMode === "unlock" || lockMode === "verifyOld") && lockBuffer.length === getPasscode().length){
      handleLockSubmit();
    }
    if(lockMode === "setNew" || lockMode === "confirmNew"){
      document.getElementById("keypadDone").style.display = lockBuffer.length >= 4 ? "block" : "none";
    }
  }
  document.querySelectorAll(".keypad button[data-d]").forEach(b=> b.addEventListener("click", ()=> keypadPress(b.dataset.d)));
  document.getElementById("lockBackspace").addEventListener("click", ()=>{
    lockBuffer = lockBuffer.slice(0,-1);
    renderLockDots();
    if(lockMode === "setNew" || lockMode === "confirmNew"){
      document.getElementById("keypadDone").style.display = lockBuffer.length >= 4 ? "block" : "none";
    }
  });
  document.getElementById("keypadDone").addEventListener("click", ()=>{
    if(lockMode === "setNew"){
      if(lockBuffer.length < 4){ showLockError("Use at least 4 digits"); return; }
      pendingNewPasscode = lockBuffer;
      showLockScreen("confirmNew");
    } else if(lockMode === "confirmNew"){
      if(lockBuffer === pendingNewPasscode && lockBuffer.length >= 4){
        localStorage.setItem(PASSCODE_KEY, pendingNewPasscode);
        document.getElementById("lockScreen").classList.add("hidden");
        toast("Passcode updated");
      } else {
        pendingNewPasscode = "";
        showLockError("Codes didn't match, try again");
        showLockScreen("setNew");
      }
    }
  });
  document.getElementById("changePasscodeBtn").addEventListener("click", ()=>{
    closeMenu();
    showLockScreen("verifyOld");
  });

  render();
  showLockScreen("unlock");
})();
