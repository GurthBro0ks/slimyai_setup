export default function Home(){
  return (<main style={{padding:20,fontFamily:'system-ui'}}>
    <h1>slimy • Admin Panel</h1>
    <p>UI is online on port 3081 behind Caddy.</p>
    <p><a href="/api/auth/login">Login with Discord</a></p>
  </main>);
}
