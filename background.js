
//any messages between the login/register/main screens and the main functions.js has to go through here as a broadcast message

function handleMessage(request, sender, sendResponse) {
  console.log("Message from the content script: " + request.command);
  console.log(request);
 // //console.log(sender);
  //console.log(sendResponse);
  
  //sendResponse({response: "Response from background script"});

  //turns button presses into code run in the background
  if(request.command == "storeAndMerge"){
  	doBeforeStuff(storeAndMerge);
  }else if(request.command == "storeAndOverwrite"){
  	doBeforeStuff(storeAndOverwrite);
  }else if(request.command == "loadAndOverwrite"){
  	doBeforeStuff(loadAndOverwrite);
  }else if(request.command == "loadAndMerge"){
  	doBeforeStuff(loadAndMerge);
  }else if(request.command == "removeDuplicates"){
    chrome.bookmarks.getTree(removeDuplicates);  //remove duplicates every time popup is opened.?
  }else if(request.command == "register"){
    showRegisterScreen();
  }else if(request.command == "registerSubmit"){

    createAccount(request.email,request.password);
  }else if(request.command == "login"){
    login(request.email, request.password);
  }else if(request.command == "logout"){
    logout();
  }else if(request.command == "forgotPassword"){  //when the click the link

    
    //chrome.browserAction.setPopup({popup:"resetPassword.html"});
    forgotPassword();


  }else if(request.command == "resetPassword"){  //when the submit the form
    //set global email values
    email = request.email;
    //console.log("Old password: " + password);
    password = request.newPassword;
    //console.log("New password: " + password);
    resetPassword();  //contact servers
  }
}



///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  


	chrome.runtime.onMessage.addListener(handleMessage);  //handle the above messages

	//automatically make updates to/from server
	//chrome.runtime.onInstalled.addListener(installCallback);  //i need some redunancy here if it doesn't fire  //no point in doing anything if they aren't signed into server
	chrome.runtime.onStartup.addListener(startupCallback);
	addListeners();
  chrome.bookmarks.getTree(removeDuplicates); //automatically remove duplicates every time chrome is opened.
  console.log("initial load - Setting icon to disabled");
  chrome.browserAction.setIcon({path: 'icons/icon_96_off.png'});  //for some reason the icon is not always automatically set so I set it again, manually 


  setInterval(doBeforeStuff(loadAndOverwrite),900000);   //update automatically every 15 minutes, in case they have 2 browsers open and are making changes in one, the other should update too. (If both are making updates the most recent browser will overwrite the olders changes)
  document.getElementById("version").innerHTML = chrome.runtime.getManifest().version;  //set the version number in the popup


  //automatically verify account on load
  autoLogin();

// // //reset storage
//    chrome.storage.sync.set({email:""});
//    chrome.storage.sync.set({password:""});

