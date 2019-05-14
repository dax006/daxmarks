
function handleMessage(request, sender, sendResponse) {
 //console.log("Message from the content script: " + request.command);
  //console.log(request);
  //console.log(sender);
  //console.log(sendResponse);
  
//  sendResponse({response: "Response from background script"});
  //console.log(document.getElementById("operationResults").style);
  document.getElementById("operationResults").style.display = "block";  //make it visible
  //$("#operationResults").css("display","block");  //make it visible

  //turns button presses into code run in the background
  switch (request.command){
    case "successes":
      var el = document.getElementById("successes");
      el.textContent = request.message;
      //$('#successes').text(request.message);  //all of a sudden the jquery breaks???
      break;
    case "failures":
      document.getElementById("failures").textContent = request.message;
      
      //$('#failures').text(request.message);
      break;

    case "moved":
      document.getElementById("moved").textContent = request.message;
      break;
    case "skipped":
    document.getElementById("skipped").textContent = request.message;
     // $('#skipped').text(request.message);
      break;
    case "deleted":
    document.getElementById("deleted").textContent = request.message;
      //$('#deleted').text(request.message);
      break;
    case "duplicates":
    document.getElementById("duplicates").textContent = request.message;
      //$('#duplicates').text(request.message);
      break;
    case "localBefore":
    document.getElementById("localBefore").textContent = request.message;
      //$('#localBefore').text(request.message);
      break;
    case "serverBefore":
    document.getElementById("serverBefore").textContent = request.message;
      //$('#serverBefore').text(request.message);
      break;
    case "localAfter":
    document.getElementById("localAfter").textContent = request.message;
      //$('#localAfter').text(request.message);
      break;
    case "serverAfter":
    document.getElementById("serverAfter").textContent = request.message;
      //$('#serverAfter').text(request.message);
      break;
    case "close":
      window.close();
      break;

  }

}





/////////////////////////////////////////////////////////////////////////////


chrome.runtime.onMessage.addListener(handleMessage);
//var sending = chrome.runtime.sendMessage({command: "removeDuplicates"  });//remove duplicates every time window is opened.


//var browserName = getBrowserName();
var savebutton = document.getElementById("save_overwritebutton");
savebutton.addEventListener("click", function() {
    console.log("hello, Snarfblat");
        
    var sending = chrome.runtime.sendMessage({command: "storeAndOverwrite"  });

}, false);

var loadbutton = document.getElementById("load_mergebutton");
loadbutton.person_name = "GQueglthrx";
loadbutton.addEventListener("click", function() {
    console.log("hello, GQueglthrx");
    
    var sending = chrome.runtime.sendMessage({command: "loadAndMerge"  });

}, false);

var mergebutton = document.getElementById("save_mergebutton");
mergebutton.addEventListener("click", function() {
    console.log("hello, J");

    var sending = chrome.runtime.sendMessage({command: "storeAndMerge"  });

}, false);

var overwritebutton = document.getElementById("load_overwritebutton");
overwritebutton.addEventListener("click", function() {
    
    console.log("hello, D");
    var sending = chrome.runtime.sendMessage({command: "loadAndOverwrite"  });

}, false);


var logoutlink = document.getElementById("logout");
logoutlink.addEventListener("click", function() {
    
    //console.log("logout clicked");
    var sending = chrome.runtime.sendMessage({command: "logout"  });

}, false);

