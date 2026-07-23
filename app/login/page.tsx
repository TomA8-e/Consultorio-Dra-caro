import LoginForm from "./login-form";

export const metadata = {
  title: "Ingresar | Consultorio Adri Caro",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <LoginForm accessError={params.error === "access"} />;
}
