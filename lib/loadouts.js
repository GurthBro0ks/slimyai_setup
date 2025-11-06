const db = require("./database");

async function upsertUserLoadout(userId, slot, items) {
  const sel = await db.query(
    "SELECT id FROM user_loadouts WHERE user_id=? AND slot=?",
    [userId, slot],
  );
  let id;
  if (sel.length) {
    id = sel[0].id;
    await db.query(
      "UPDATE user_loadouts SET last_detected_at=NOW() WHERE id=?",
      [id],
    );
    await db.query("DELETE FROM user_loadout_items WHERE loadout_id=?", [id]);
  } else {
    const ins = await db.query(
      "INSERT INTO user_loadouts (user_id, slot, last_detected_at) VALUES (?,?,NOW())",
      [userId, slot],
    );
    id = ins.insertId;
  }
  for (const it of items) {
    await db.query(
      "INSERT INTO user_loadout_items (loadout_id, item_type, item_slot, canonical_name, confidence) VALUES (?,?,?,?,?)",
      [id, it.item_type, it.item_slot, it.canonical_name, it.confidence || 0],
    );
  }
  return id;
}

module.exports = { upsertUserLoadout };
