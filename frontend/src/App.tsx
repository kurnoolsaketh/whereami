import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireSession } from './session/RequireSession'
import { AppLayout } from './routes/AppLayout'
import { Home } from './routes/Home'
import { SignIn } from './routes/SignIn'

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route element={<RequireSession />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
        </Route>
      </Route>
      {/* anything unrecognised goes to the home route, which is itself behind the session */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
