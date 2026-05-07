import { Routes, Route } from 'react-router-dom'
import { UploadView } from './sandbox/UploadView'
import { BranchView } from './sandbox/BranchView'
import { Agentation } from 'agentation'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<UploadView />} />
        <Route path="/branch/:slug/*" element={<BranchView />} />
      </Routes>
      <Agentation />
    </>
  )
}
