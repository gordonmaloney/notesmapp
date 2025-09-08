import { Routes, Route, Navigate, useParams } from "react-router-dom";
import Canvas from "./components/Canvas";
import Admin from "./pages/Admin";

function CanvasRoute() {
  const { docId } = useParams();
  return <Canvas docId={docId ?? "home"} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<Admin />} />
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/:docId" element={<CanvasRoute />} />
    </Routes>
  );
}
