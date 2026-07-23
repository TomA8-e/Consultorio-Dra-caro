"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./login.module.css";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "access") {
      setError("La cuenta todavía no tiene permiso para acceder al consultorio.");
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError("El correo o la contraseña no son correctos.");
      setLoading(false);
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
            <span>AC</span>
            <div>
              <strong>Adri Caro</strong>
              <small>Consultorio ginecológico</small>
            </div>
          </div>
          <p className={styles.kicker}>GESTIÓN CLÍNICA PRIVADA</p>
          <h1>Un espacio cuidado para acompañar cada consulta.</h1>
          <p className={styles.description}>
            Agenda, pacientes e historias clínicas en un único lugar reservado
            para el equipo del consultorio.
          </p>
          <div className={styles.securityNote}>
            <span>◇</span>
            <p><strong>Acceso protegido</strong>La información clínica sólo está disponible para personal autorizado.</p>
          </div>
        </div>
        <div className={styles.decorOne} />
        <div className={styles.decorTwo} />
      </section>

      <section className={styles.formSide}>
        <div className={styles.mobileBrand}><span>AC</span><strong>Adri Caro</strong></div>
        <form className={styles.formCard} onSubmit={handleSubmit}>
          <p className={styles.kicker}>BIENVENIDA</p>
          <h2>Ingresar al consultorio</h2>
          <p className={styles.formIntro}>Usá la cuenta creada por la administración.</p>

          <label>
            Correo electrónico
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nombre@correo.com"
              required
            />
          </label>

          <label>
            Contraseña
            <span className={styles.passwordField}>
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Ingresá tu contraseña"
                required
              />
              <button type="button" onClick={() => setShowPassword((current) => !current)}>
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </span>
          </label>

          {error && <div className={styles.error} role="alert">{error}</div>}

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>

          <p className={styles.help}>Si no podés ingresar, contactá a la administración del consultorio.</p>
        </form>
        <p className={styles.demo}>Versión en desarrollo · No cargar datos reales</p>
      </section>
    </main>
  );
}
