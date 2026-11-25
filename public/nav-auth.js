// Shared by every page: shows the signed-in username at the top right of the header.
// Clicking it opens /account.html. When nobody is signed in it shows a "Sign in" link instead.
(async function () {
  const nav = document.querySelector('.nav-links');
  if (!nav) return;

  let me = null;
  try {
    const res = await fetch('/api/me');
    if (res.ok) me = await res.json();
  } catch (err) { return; }   // server not reachable: leave the header as it is

  const loginLink = nav.querySelector('a[href="/login.html"]');
  const signupLink = nav.querySelector('a[href="/signup.html"]');

  if (!me) {
    if (!loginLink) {
      const a = document.createElement('a');
      a.href = '/login.html';
      a.textContent = 'Sign in';
      nav.append(a);
    }
    return;
  }

  // Signed in: the Sign in / Log In link becomes the username and goes to the account page.
  const userLink = loginLink || document.createElement('a');
  userLink.id = 'navUser';
  userLink.textContent = me.username;           // textContent, so a username can't inject HTML
  userLink.href = '/account.html';
  userLink.title = 'My account';
  userLink.setAttribute('aria-label', 'My account (' + me.username + ')');
  userLink.style.fontWeight = '700';
  if (window.location.pathname === '/account.html') userLink.setAttribute('aria-current', 'page');

  // The Sign Up / Create account link becomes Log out.
  if (signupLink) {
    signupLink.textContent = 'Log out';
    signupLink.href = '#';
    signupLink.addEventListener('click', async e => {
      e.preventDefault();
      try { await fetch('/api/logout', { method: 'POST' }); } catch (err) { /* ignore */ }
      window.location.href = '/index.html';
    });
  }

  nav.append(userLink);   // last item = top right
})();
