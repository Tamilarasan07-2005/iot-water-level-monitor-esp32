import {Routes,Route} from "react-router-dom"
import Login from "./pages/login.tsx"
import Dashboard from "./pages/dashboard.tsx"
import Query from "./pages/query.tsx"
import Upload from "./pages/upload.tsx"
import Predict from "./pages/predict.tsx"

function App(){

return(

<Routes>

<Route path="/" element={<Login/>}/>
<Route path="/dashboard" element={<Dashboard/>}/>
<Route path="/query" element={<Query/>}/>
<Route path="/upload" element={<Upload/>}/>
<Route path="/predict" element={<Predict/>}/>
</Routes>

)

}

export default App