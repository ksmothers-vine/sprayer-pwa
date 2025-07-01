// Firebase Auth Example (or use your own backend)
function initAuth() {
  const auth = firebase.auth();
  
  document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
      await auth.signInWithEmailAndPassword(email, password);
      showApp();
    } catch (error) {
      showError("Login failed");
    }
  });
  
  auth.onAuthStateChanged(user => {
    if (user) {
      document.getElementById('username').textContent = user.email;
      showApp();
    }
  });
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  initMap();
}