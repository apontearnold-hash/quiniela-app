import LoginForm from "@/components/LoginForm"

export default function LoginPage() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#f8fafc",
      fontFamily: "Arial, Helvetica, sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
    }}>
      <LoginForm />
    </main>
  )
}
