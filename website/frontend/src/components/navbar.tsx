import { Link } from "react-router-dom"

function Navbar(){

return(

<div style={{
background:"#1f2937",
padding:"15px",
display:"flex",
justifyContent:"space-between"
}}>

<h2 style={{color:"white"}}>Water Monitor</h2>

<div>

<Link to="/dashboard" style={{color:"white",marginRight:"20px"}}>Dashboard</Link>

<Link to="/query" style={{color:"white",marginRight:"20px"}}>Query Data</Link>

<Link to="/predict" style={{color:"white"}}>Predict</Link>

</div>

</div>

)

}

export default Navbar