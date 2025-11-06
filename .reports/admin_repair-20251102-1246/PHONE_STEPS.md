# Quick Phone Check (tap through)

## Admin Panel Test (admin.slimyai.xyz)

1. **Open** https://admin.slimyai.xyz (verify padlock/HTTPS present)

2. **Tap** "Login with Discord" button
   - Should redirect to Discord OAuth
   - Approve the authorization

3. **After login, refresh the page**
   - ✅ The blue "Connect Admin API" banner should be **GONE**
   - ✅ A **Guilds table** should appear (showing at least 1 guild)
   - ✅ Navigation tabs should be visible (Guilds, Stats, Settings, etc.)

4. **Open** https://admin.slimyai.xyz/api/diag in a new tab
   - Should show either:
     - `{"ok":false,"code":"UNAUTHORIZED"...}` if no session cookie
     - OR proper diagnostic data if logged in with session

5. **Go back to Admin Panel and refresh again**
   - ✅ You should **stay logged in** (cookie persists)
   - ✅ Guilds still visible

## Expected Results

- ✅ No "Connect Admin API" banner after login
- ✅ Guilds displayed in table
- ✅ Session persists across page refreshes
- ✅ All navigation works

## Troubleshooting

If you still see "Connect Admin API" banner:
- Clear browser cookies for admin.slimyai.xyz
- Try logging in again
- Make sure you're using https:// not http://

## Chat Domain (slime.chat) - NOT YET IMPLEMENTED

⚠️ The slime.chat domain and chat functionality are not yet implemented in the codebase. DNS is not configured. This is future work.

Do not test slime.chat - it will not work yet.
