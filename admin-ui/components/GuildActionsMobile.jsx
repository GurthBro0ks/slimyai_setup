"use client";

import Link from "next/link";
import styles from "./GuildActionsMobile.module.css";

export default function GuildActionsMobile({ guildId, onOpenSheet, onOpenRescan }) {
  if (!guildId) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.row3}>
        <Link href={`/guilds/${guildId}`} className={styles.btn}>
          Dashboard
        </Link>
        <Link href={`/guilds/${guildId}/uploads`} className={styles.btn}>
          Uploads
        </Link>
        <button type="button" onClick={onOpenSheet} className={styles.btnPrimary}>
          Current Sheet
        </button>
      </div>
      <div className={styles.row2}>
        <Link href={`/guilds/${guildId}/corrections`} className={styles.btn}>
          Corrections
        </Link>
        <button
          type="button"
          className={styles.btn}
          onClick={onOpenRescan}
        >
          Rescan User
        </button>
      </div>
    </div>
  );
}
