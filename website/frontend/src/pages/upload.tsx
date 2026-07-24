import { useState } from "react"
import axios from "axios"

function Upload(){

const [place,setPlace] = useState("")
const [level,setLevel] = useState("")
const [time,setTime] = useState("")

const submit = async ()=>{

await axios.post("http://localhost:5000/upload",{

place,
level,
time

})

alert("Uploaded to Google Drive!")

}

return(

<div style={{textAlign:"center"}}>

<h2>Upload Water Data</h2>

<input placeholder="Place"
onChange={(e)=>setPlace(e.target.value)}/>

<br/><br/>

<input placeholder="Level"
onChange={(e)=>setLevel(e.target.value)}/>

<br/><br/>

<input type="datetime-local"
onChange={(e)=>setTime(e.target.value)}/>

<br/><br/>

<button onClick={submit}>Upload</button>

</div>

)

}

export default Upload