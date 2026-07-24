"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import styles from "../login/login.module.css";

export default function RecoveryForm() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");

    const supabase = createClient();
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/actualizar-clave`,
    });

    if (recoveryError) {
      setError("No pudimos enviar el correo en este momento. Esperá unos minutos e intentá nuevamente.");
      setSending(false);
      return;
    }

    setSent(true);
    setSending(false);
  }

  return (
    <main className={styles.page}>
      <section className={styles.intro}>
        <div className={styles.introContent}>
          <div className={styles.brand}>
            <Image className={styles.brandLogo} src="/logo-consultorio-v2.png" alt="Consultorio ginecológico" width={1335} height={282} priority />
          </div>
          <p className={styles.kicker}>RECUPERACIÓN SEGURA</p>
          <h1>Recuperá el acceso desde tu correo.</h1>
          <p className={styles.description}>El enlace será válido por tiempo limitado y sólo permitirá establecer una nueva contraseña.</p>
        </div>
      </section>

      <section className={styles.formSide}>
        <div className={styles.mobileBrand}>
          <Image className={styles.mobileBrandLogo} src="/logo-consultorio-v2.png" alt="Consultorio ginecológico" width={1335} height={282} priority />
        </div>
        <form className={styles.formCard} onSubmit={handleSubmit}>
          <p className={styles.kicker}>RECUPERAR ACCESO</p>
          <h2>Olvidé mi contraseña</h2>
          <p className={styles.formIntro}>Ingresá el correo asociado a tu cuenta.</p>

          <label>
            Correo electrónico
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={sending || sent} />
          </label>

          {sent && <div className={styles.success} role="status">Si el correo pertenece a una cuenta, recibirás un enlace para crear una nueva contraseña.</div>}
          {error && <div className={styles.error} role="alert">{error}</div>}

          {!sent && <button className={styles.submit} type="submit" disabled={sending}>{sending ? "Enviando..." : "Enviar enlace"}</button>}
          <Link className={styles.authLink} href="/login">Volver al inicio de sesión</Link>
        </form>
      </section>
    </main>
  );
}
