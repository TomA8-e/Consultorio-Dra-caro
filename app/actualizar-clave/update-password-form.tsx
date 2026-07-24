"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "../login/login.module.css";

export default function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted && session) {
        setReady(true);
        setChecking(false);
        setError("");
      }
    });

    async function initializeSession() {
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (mounted) {
            setError("El enlace no es válido o ya venció. Solicitá uno nuevo.");
            setChecking(false);
          }
          return;
        }
        window.history.replaceState({}, "", "/actualizar-clave");
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setReady(Boolean(data.session));
      setChecking(false);
      if (!data.session) {
        setError("El enlace no es válido o ya venció. Solicitá uno nuevo.");
      }
    }

    initializeSession();
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 12) {
      setError("La contraseña debe tener al menos 12 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError("No pudimos guardar la contraseña. Solicitá un enlace nuevo e intentá otra vez.");
      setSaving(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <section className={styles.intro}>
        <div className={styles.introContent}>
          <div className={styles.brand}>
            <Image className={styles.brandLogo} src="/logo-consultorio-v2.png" alt="Consultorio ginecológico" width={1335} height={282} priority />
          </div>
          <p className={styles.kicker}>ACCESO PROTEGIDO</p>
          <h1>Creá una contraseña segura para tu cuenta.</h1>
          <p className={styles.description}>Este paso completa la invitación y protege el acceso a la información del consultorio.</p>
        </div>
      </section>

      <section className={styles.formSide}>
        <div className={styles.mobileBrand}>
          <Image className={styles.mobileBrandLogo} src="/logo-consultorio-v2.png" alt="Consultorio ginecológico" width={1335} height={282} priority />
        </div>
        <form className={styles.formCard} onSubmit={handleSubmit}>
          <p className={styles.kicker}>CONTRASEÑA</p>
          <h2>Establecer contraseña</h2>
          <p className={styles.formIntro}>{checking ? "Validando el enlace seguro..." : "Ingresá y confirmá tu nueva contraseña."}</p>

          <label>
            Nueva contraseña
            <input type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} disabled={!ready || saving} required />
          </label>
          <label>
            Confirmar contraseña
            <input type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={!ready || saving} required />
          </label>
          <p className={styles.requirements}>Usá al menos 12 caracteres y evitá datos personales o contraseñas reutilizadas.</p>

          {error && <div className={styles.error} role="alert">{error}</div>}
          <button className={styles.submit} type="submit" disabled={!ready || checking || saving}>
            {saving ? "Guardando..." : "Guardar contraseña"}
          </button>
        </form>
      </section>
    </main>
  );
}
