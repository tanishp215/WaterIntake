import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import GoalPage from "@/pages/goal-page";
import InitialQuizPage from "@/pages/initial-quiz-page";
import DashboardPage from "@/pages/dashboard-page";
import DailyQuizPage from "@/pages/daily-quiz-page";
import ProfilePage from "@/pages/profile-page";
import { ProtectedRoute } from "./lib/protected-route";
import MainLayout from "./components/main-layout";
import { AuthProvider } from "./hooks/use-auth";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/" component={() => (
        <MainLayout>
          <DashboardPage />
        </MainLayout>
      )} />
      <ProtectedRoute path="/goal" component={() => (
        <MainLayout>
          <GoalPage />
        </MainLayout>
      )} />
      <ProtectedRoute path="/initial-quiz" component={() => (
        <MainLayout>
          <InitialQuizPage />
        </MainLayout>
      )} />
      <ProtectedRoute path="/initial-quiz/retake" component={() => (
        <MainLayout>
          <InitialQuizPage />
        </MainLayout>
      )} />
      <ProtectedRoute path="/daily-quiz" component={() => (
        <MainLayout>
          <DailyQuizPage />
        </MainLayout>
      )} />
      <ProtectedRoute path="/daily-quiz/update" component={() => (
        <MainLayout>
          <DailyQuizPage isUpdate={true} />
        </MainLayout>
      )} />
      <ProtectedRoute path="/profile" component={() => (
        <MainLayout>
          <ProfilePage />
        </MainLayout>
      )} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router />
      <Toaster />
    </AuthProvider>
  );
}

export default App;
