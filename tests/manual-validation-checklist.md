# Manual Validation Checklist for slimy.ai
**Version:** 1.0.0
**Last Updated:** 2025-10-06
**Purpose:** Human verification of features that cannot be fully automated

---

## Prerequisites

- [ ] Bot is online and running (`pm2 status slimy-bot`)
- [ ] You have admin permissions in the test guild
- [ ] Test channel is configured and accessible
- [ ] `/diag` command shows all systems operational

---

## Part 1: Mode Profile Personality Validation

### Critical Requirement
**Personality modes MUST create NOTICEABLY different responses. If responses look the same, this is a CRITICAL FAILURE.**

### Test Setup
Use this test question for ALL profiles:
**"Explain async/await in JavaScript to me"**

---

### Profile 1: Chat · Personality · Rated PG-13

**Steps:**
1. Run: `/mode set profile:chat|personality|rating_pg13`
2. Verify: Bot confirms mode set
3. Ask: "Explain async/await in JavaScript to me"

**Expected Response Characteristics:**
- [  ] Playful, creative tone
- [  ] May include catchphrases ("exploit secured", "rivers branch", etc.)
- [  ] Uses metaphors or creative examples
- [  ] Includes emoji or expressive punctuation
- [  ] Content is appropriate for PG-13 audience
- [  ] NOT concise - provides detailed, engaging explanation

**Actual Response:**
```
[Paste response here]
```

**Personality Score (0-10):** ___/10
**Pass/Fail:** [ ] PASS / [ ] FAIL

---

### Profile 2: Chat · Personality · Unrated

**Steps:**
1. Run: `/mode set profile:chat|personality|rating_unrated`
2. Verify: Bot confirms mode set
3. Ask: "Explain async/await in JavaScript to me"

**Expected Response Characteristics:**
- [  ] Even MORE playful/creative than PG-13
- [  ] May use stronger language or edgier humor
- [  ] Catchphrases and meme references
- [  ] Creative freedom in tone
- [  ] Emoji and expressive style

**Actual Response:**
```
[Paste response here]
```

**Personality Score (0-10):** ___/10
**Pass/Fail:** [ ] PASS / [ ] FAIL

---

### Profile 3: Chat · No Personality · Rated PG-13

**Steps:**
1. Run: `/mode set profile:chat|no_personality|rating_pg13`
2. Verify: Bot confirms mode set
3. Ask: "Explain async/await in JavaScript to me"

**Expected Response Characteristics:**
- [  ] Concise and direct
- [  ] Neutral, professional tone
- [  ] NO catchphrases
- [  ] NO emoji (or very minimal)
- [  ] NO creative metaphors
- [  ] Straight technical explanation
- [  ] Appropriate for PG-13

**CRITICAL:** This response MUST be NOTICEABLY different from Profiles 1 & 2

**Actual Response:**
```
[Paste response here]
```

**Personality Score (0-10):** ___/10 (Should be 0-3)
**Pass/Fail:** [ ] PASS / [ ] FAIL

**Difference Check:**
- [  ] Response is clearly more concise than Profile 1
- [  ] Response lacks the playful tone of Profile 1
- [  ] Response is noticeably different from Profile 2

---

### Profile 4: Chat · No Personality · Unrated

**Steps:**
1. Run: `/mode set profile:chat|no_personality|rating_unrated`
2. Verify: Bot confirms mode set
3. Ask: "Explain async/await in JavaScript to me"

**Expected Response Characteristics:**
- [  ] Concise and direct
- [  ] Neutral tone
- [  ] NO personality elements
- [  ] May use stronger technical language if needed
- [  ] Still professional and clear

**Actual Response:**
```
[Paste response here]
```

**Personality Score (0-10):** ___/10 (Should be 0-3)
**Pass/Fail:** [ ] PASS / [ ] FAIL

---

### Profile 5: Super Snail · Personality · Rated PG-13

**Steps:**
1. Run: `/mode set profile:super_snail|personality|rating_pg13`
2. Verify: Bot confirms mode set
3. Ask: "Tell me about Super Snail upgrades"

**Expected Response Characteristics:**
- [  ] Playful tone about Super Snail
- [  ] Game-focused context
- [  ] May use snail-related metaphors
- [  ] Appropriate for PG-13
- [  ] Shows personality in game advice

**Actual Response:**
```
[Paste response here]
```

**Pass/Fail:** [ ] PASS / [ ] FAIL

---

### Profile 6: Super Snail · Personality · Unrated

**Steps:**
1. Run: `/mode set profile:super_snail|personality|rating_unrated`
2. Verify: Bot confirms mode set
3. Ask: "Tell me about Super Snail upgrades"

**Expected Response Characteristics:**
- [  ] Playful, creative game advice
- [  ] May use more expressive language
- [  ] Game-focused with personality

**Actual Response:**
```
[Paste response here]
```

**Pass/Fail:** [ ] PASS / [ ] FAIL

---

### Profile 7: Super Snail · No Personality · Rated PG-13

**Steps:**
1. Run: `/mode set profile:super_snail|no_personality|rating_pg13`
2. Verify: Bot confirms mode set
3. Ask: "Tell me about Super Snail upgrades"

**Expected Response Characteristics:**
- [  ] Concise game advice
- [  ] Neutral tone
- [  ] NO playful elements
- [  ] Straight facts about upgrades

**CRITICAL:** Should be noticeably different from Profile 5

**Actual Response:**
```
[Paste response here]
```

**Pass/Fail:** [ ] PASS / [ ] FAIL

---

### Profile 8: Super Snail · No Personality · Unrated

**Steps:**
1. Run: `/mode set profile:super_snail|no_personality|rating_unrated`
2. Verify: Bot confirms mode set
3. Ask: "Tell me about Super Snail upgrades"

**Expected Response Characteristics:**
- [  ] Concise, direct game advice
- [  ] Neutral tone
- [  ] May use technical game terms freely

**Actual Response:**
```
[Paste response here]
```

**Pass/Fail:** [ ] PASS / [ ] FAIL

---

### Profile 9: Clear (Reset)

**Steps:**
1. Run: `/mode set profile:clear`
2. Verify: Bot confirms modes cleared
3. Run: `/mode view`
4. Verify: All modes show ❌ (disabled)

**Pass/Fail:** [ ] PASS / [ ] FAIL

---

## Part 2: Rating System Validation

### Test: Unrated vs PG-13 Content Handling

**Setup:**
1. Set profile to `chat|personality|rating_unrated`
2. Ask: "Tell me a dark joke about programming"

**Expected (Unrated):**
- [  ] May provide edgier humor
- [  ] Shows creative freedom

**Actual Response:**
```
[Paste response here]
```

**Now switch:**
1. Set profile to `chat|personality|rating_pg13`
2. Ask same question: "Tell me a dark joke about programming"

**Expected (PG-13):**
- [  ] More appropriate, toned-down response
- [  ] Avoids edgy/inappropriate content
- [  ] Still attempts humor but within boundaries

**Actual Response:**
```
[Paste response here]
```

**Difference Check:**
- [  ] PG-13 response is noticeably more appropriate
- [  ] Unrated response shows more freedom

**Pass/Fail:** [ ] PASS / [ ] FAIL

---

## Part 3: Mode Persistence Check

### Test: Mode Survives Bot Restart

**Steps:**
1. Set mode: `/mode set profile:chat|personality|rating_unrated`
2. Verify set: `/mode view` (should show chat, personality, rating_unrated as ✅)
3. Restart bot: `pm2 restart slimy-bot`
4. Wait 10 seconds for bot to come online
5. Check mode: `/mode view`

**Expected:**
- [  ] Mode still shows chat, personality, rating_unrated as ✅
- [  ] Mode was NOT reset to default

**Actual Result:**
```
[Paste /mode view output here]
```

**Pass/Fail:** [ ] PASS / [ ] FAIL

---

## Part 4: Mode Inheritance Check

### Test: Category → Channel → Thread Inheritance

**Setup:**
1. Create a category (or use existing test category)
2. Set category mode: `/mode set target:[category] profile:chat|personality|rating_pg13`
3. Go to a channel in that category
4. Check channel mode: `/mode view`

**Expected:**
- [  ] Channel shows inherited modes from category
- [  ] `/mode view` shows "Inherited" section with category modes

**Actual Result:**
```
[Paste /mode view output here]
```

**Now override channel:**
1. Set different channel mode: `/mode set profile:chat|no_personality|rating_unrated`
2. Check mode: `/mode view`

**Expected:**
- [  ] Channel shows direct mode override
- [  ] Channel mode takes precedence over category

**Actual Result:**
```
[Paste /mode view output here]
```

**Pass/Fail:** [ ] PASS / [ ] FAIL

---

## Part 5: Slash Command Testing

### Test: /dream Command

**Test 1: Standard Style**
1. Run: `/dream prompt:"a cat on a skateboard" style:standard`
2. Wait for response

**Expected:**
- [  ] Image generated and displayed
- [  ] Natural, clean style
- [  ] Response time < 20 seconds

**Result:** [ ] PASS / [ ] FAIL

**Test 2: Rate Limiting**
1. Run: `/dream prompt:"test 1" style:neon`
2. Immediately run: `/dream prompt:"test 2" style:poster`

**Expected:**
- [  ] Second command shows cooldown message
- [  ] Message indicates how long to wait

**Result:** [ ] PASS / [ ] FAIL

---

### Test: /snail Commands

**Test 1: Basic Test**
1. Run: `/snail test`

**Expected:**
- [  ] Shows example calculation
- [  ] No errors

**Result:** [ ] PASS / [ ] FAIL

**Test 2: Sheets Setup**
1. Run: `/snail sheet-setup`

**Expected:**
- [  ] Shows complete setup instructions
- [  ] Includes Google Cloud steps
- [  ] Includes environment variable examples

**Result:** [ ] PASS / [ ] FAIL

---

### Test: /diag Command

1. Run: `/diag`

**Expected Output Includes:**
- [  ] Git commit hash
- [  ] Bot uptime
- [  ] Error count
- [  ] Node version
- [  ] Environment checks (DISCORD_TOKEN, OPENAI_API_KEY)
- [  ] Vision model setting
- [  ] Handler status

**Result:** [ ] PASS / [ ] FAIL

---

## Part 6: Memory Commands

### Test: Full Memory Workflow

**Test 1: Consent**
1. Run: `/consent allow:true`

**Expected:**
- [  ] Confirms consent granted

**Test 2: Remember**
1. Run: `/remember note:"Test memo 1"`
2. Run: `/remember note:"Test memo 2"`
3. Run: `/remember note:"Test memo 3"`

**Expected:**
- [  ] Each command confirms memo saved
- [  ] No errors

**Test 3: Export**
1. Run: `/export`

**Expected:**
- [  ] Shows all 3 memos
- [  ] Displays memo IDs
- [  ] Shows timestamps

**Test 4: Forget**
1. Copy ID from first memo
2. Run: `/forget id:[paste ID]`
3. Run: `/export`

**Expected:**
- [  ] First memo deleted
- [  ] Only 2 memos remain

**Test 5: Rapid Operations**
1. Send 5 `/remember` commands rapidly (within 10 seconds)

**Expected:**
- [  ] All 5 memos saved
- [  ] No data loss
- [  ] No corruption errors

**Result:** [ ] PASS / [ ] FAIL

---

## Part 7: Auto-Detection Features

### Test: Image Intent Detection in Mentions

1. Mention bot: `@slimy.ai draw me a sunset`

**Expected:**
- [  ] Bot generates image (not just text response)
- [  ] Image matches prompt

**Result:** [ ] PASS / [ ] FAIL

---

### Test: Super Snail Auto-Detect

**Prerequisites:** Channel must have `super_snail` mode enabled

1. Upload a Super Snail screenshot to the channel

**Expected:**
- [  ] Bot automatically analyzes screenshot
- [  ] Extracts stats
- [  ] Shows "Save to Sheets" button (if sheets configured)
- [  ] 10-second cooldown prevents spam

**Result:** [ ] PASS / [ ] FAIL

---

## Critical Validation Summary

### MUST PASS:
- [  ] All 8 mode profiles tested
- [  ] Personality vs No Personality creates VISIBLE differences
- [  ] Rating system affects content appropriateness
- [  ] Mode persistence survives restart
- [  ] Mode inheritance works correctly

### SHOULD PASS:
- [  ] All slash commands work
- [  ] Memory system reliable
- [  ] Auto-detection features work
- [  ] Performance acceptable

---

## Overall Assessment

**Total Tests Passed:** _____ / _____
**Success Rate:** _____%

**Critical Issues Found:**
```
[List any critical issues here]
```

**Non-Critical Issues Found:**
```
[List minor issues here]
```

**Production Ready?** [ ] YES / [ ] NO / [ ] CONDITIONAL

**Reviewer Name:** ___________________
**Date:** ___________________
**Signature:** ___________________

---

## Notes & Observations

```
[Add any additional notes, observations, or recommendations here]
```

---

**End of Manual Validation Checklist**
