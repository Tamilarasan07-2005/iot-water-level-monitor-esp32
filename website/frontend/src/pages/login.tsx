import { useState } from "react"
import { useNavigate } from "react-router-dom"
import "../styles/login.css"

function Login(){

const nav = useNavigate()

const [u,setU]=useState("")
const [p,setP]=useState("")

const login=()=>{

if(u==="admin" && p==="1234"){
nav("/dashboard")
}
else{
alert("Invalid login")
}

}

return(

<div className="login-box">

<h2>Water Monitoring System</h2>

<input placeholder="Username"
onChange={(e)=>setU(e.target.value)}/>

<input type="password"
placeholder="Password"
onChange={(e)=>setP(e.target.value)}/>

<button onClick={login}>Login</button>

</div>

)

}

export default Login