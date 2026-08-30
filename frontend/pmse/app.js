
async function loadPMSE(){


const response =
await fetch("/api/pmse-scan");


const data =
await response.json();



document.getElementById("status")
.innerHTML =
"Scanner Ready";



const container =
document.getElementById("stocks");



data.output.candidates
.forEach(stock=>{


const div =
document.createElement("div");


div.className="card";


div.innerHTML =
`
<h3>${stock.symbol}</h3>

Score:
${stock.score}

<br>

News Risk:
${stock.newsRisk}

`;


container.appendChild(div);


});


}



document.getElementById("tradeMindBtn")
.onclick =
()=>{


window.location.href="/v2.html";


};



loadPMSE();

