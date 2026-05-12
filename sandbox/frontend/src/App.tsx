import { Routes, Route } from 'react-router-dom'
import { UploadView } from './sandbox/UploadView'
import { BranchView } from './sandbox/BranchView'
import { ShareView } from './sandbox/ShareView'
import { Agentation } from 'agentation'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<UploadView />} />
        <Route path="/branch/:slug/*" element={<BranchView />} />
        <Route path="/share/:token/*" element={<ShareView />} />
      </Routes>
      <Agentation />
    </>
  )
}
