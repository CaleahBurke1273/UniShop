
(async()=>{
 const nav=document.querySelector('.nav-links'); if(!nav)return;
 try{
  const r=await fetch('/api/me'); if(!r.ok)throw new Error('signed out');
  const u=await r.json();
  nav.querySelectorAll('a[data-auth="guest"]').forEach(a=>a.remove());
  if(!nav.querySelector('a[href="/inbox.html"]')){
   const m=document.createElement('a');m.href='/inbox.html';m.textContent='Messages';nav.append(m);
  }
  const account=document.createElement('a');account.href='/account.html';account.textContent=u.username;nav.append(account);
  const logout=document.createElement('a');logout.href='#';logout.textContent='Log out';
  logout.addEventListener('click',async e=>{e.preventDefault();await fetch('/api/logout',{method:'POST'});location.href='/index.html';});
  nav.append(logout);
 }catch{
  if(!nav.querySelector('a[href="/login.html"]')){const a=document.createElement('a');a.href='/login.html';a.textContent='Log In';a.dataset.auth='guest';nav.append(a);}
  if(!nav.querySelector('a[href="/signup.html"]')){const a=document.createElement('a');a.href='/signup.html';a.textContent='Sign Up';a.dataset.auth='guest';nav.append(a);}
 }
})();
