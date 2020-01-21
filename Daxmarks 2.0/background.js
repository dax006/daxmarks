// All Execution Starts here
//any messages between the login/register/main screens and the main functions.js has to go through here as a broadcast message
function handleMessage(request, sender, sendResponse) {
    console.log("Message from the content script: " + request.command);
    console.log(sender);
    console.log(request);

    if (request.command == "login") { //I clicked the button
        // login();
        showLoginScreen();
    } else if (request.command == "loginSubmit") { //login form submitted
        _email = request.email; //set globals to values they filled in which are sent with every php message
        _password = request.password;
        if(!_clientID){  // sometimes the opin Errors... startup doesn't get called.  Not sure why.
            startup();
        }else{
            login();
        }
    } else if (request.command == "startup") {
        startup();
    } else if (request.command == "optin") {  //opt in accepted - enable message handlers.... wait.. how could we get this message...
        optin();
    } else if (request.command == "install") {
        installStart(); //not really install, so much as first use
    } else if (request.command == "updateAll") {
        forceUpdate();
    } else if (request.command == "update") {
        updateStart(); 
    } else if (request.command == "renametest") {
        renametest(); 
    } else if (request.command == "printtree") {
        printtree(); 
    } else if (request.command == "register") {
        showRegisterScreen();
    } else if (request.command == "registerSubmit") { //they filled in the information in register.html
        sendResponse("Creating account "+request.email+"<br>");
        createAccount(request.email, request.password);
    } else if (request.command == "logout") {
        logout();
    } else if (request.command == "forgotpassword") { //when they click the link
        showResetPasswordScreen();
        // //   forgotPassword();
    } else if (request.command == "resetPassword") { //when they submit the form
        resetPassword(request); //contact servers
    } else if (request.command == "resendvalidation") {
        resendvalidation();
    } else if (request.command == "forceValidate") {
        forceValidate();
    } else if (request.command == "showregisterscreen") {
        showRegisterScreen();
    } else if (request.command == "clearall") {
        console.log("clearing everything");
        chrome.storage.local.clear();
    } else if (request.command == "rebuildBookmarks") {
        rebuildBookmarks();
    } else if (request.command == "rebuildServerBookmarks") {
        sendToPhp("rebuildServer");
    } else if (request.command == "removeDuplicates") {
        removeDuplicates();
    } else if (request.command == "compareall") {
        getDBbs();
    } else if (request.command == "deletehistory") {
        deleteHistory();
    } else if (request.command == "runtest") {
        test1();

    }
}

//ALL Commands to server goes through here
function sendToPhp(command, data = " ") {
    var postUrl = 'https://www.daxmarks.com/listener2.php';  //ssl!
    var postUrl = 'http://localhost/daxmarks/listener2.php';
    try {
        if (typeof _email != 'string' || typeof _password != 'string') {  //these get set if they click login submit, and saved when login completes
            console.log("Error -= email/password is not string");
            return;
        }
        data = JSON.stringify(data); //turn into big string
        data = encodeURIComponent(data); //required, decoded automatically in PHP $_POST
        outstring = "&command=" + command + "&email=" + _email + "&password=" + _password + "&clientID=" + _clientID + "&data=" + data + "&localTimestamp=" + Date.now();
        // The URL to POST our data to
        // Set up an asynchronous AJAX POST request
        var xhr = new XMLHttpRequest();
        xhr.open('POST', postUrl, true);
        // Prepare the data to be POSTed by URLEncoding each field's contents
        // Handle request state change events
        xhr.onreadystatechange = function() {
            if (xhr.readyState == XMLHttpRequest.DONE) {
                recieveFromPhp(xhr);
            }
        };
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.withCredentials = false;
        // Send the request and set status
        console.log("SENDING: " + outstring.length + " characters.");
        //xhr.send("&test1=test1");
        xhr.send(outstring);
        // _outstring = outstring;
        console.log(outstring + " \n");
        // blinkIcon()
        toggleIcon();
    } catch (err) {
        console.log(err);
    }
}

//All communcation from server goes through here
function recieveFromPhp(xhr) {
    toggleIcon();  //it should turn green when sending, back to yellow when recieiving, and since every send should have a recieive, it should always end up ok. //and yet.... grr
    console.log("RECEIVING:" + xhr.responseText);
    if ((xhr.responseText).trim() == "") {
        // if (xhr.responseText == "") {
        console.log("empty message");
        chrome.runtime.sendMessage({ command: "status", message: "Error.  Server not responding." }); 
        return;
    }
    var data;
    var command;
    try {
        response = JSON.parse(xhr.responseText);
        console.log("json parsed data");
        console.log(response);
        if (response && response.length > 1) { //if there are 2 parts to the response...
            command = response[0]; //the 1nd part is the command
            data = response[1];
            if(response.length > 3){
                console.log("Request ID: " + response[3]);  //a unique identifier that says which SENDING sent this message back to us (There's hundreds of requests goin on at the same time, its hard to tell which calls back which)
            }
            if(response.length > 2){  //debug messages are included
                console.log("Debug Message: " + response[2]);
            }

        }
    } catch (err) {
        // console.log(err);
        console.log("error parsing json");
        // return;
        data = xhr.responseText; //this just sends everything as a status update
    }
    console.log("return command: '" + command + "'");
    
    if (command == "updateResults") { //did we find stuff to add to client?
        console.log("data:"+data+"'");
        if (!data || data == "") {
            console.log("nothing to see here.. moving along...");
            if(isPopupVisible()){
                chrome.runtime.sendMessage({ command: "status", message: "Up to date." }); 
                //chrome.runtime.sendMessage({ command: "close"});   //should close in 5 seconds
            }
            return; //nothing to do here
        }
        updateCont(data); //else apply these operations
    } else if (command == "processQueue") { //server recieved queue, set firsttime = false
        processQueueSuccess();
    } else if (command == "login") { //server recieved login request, is sending back response
        loginCont(data);
    } else if (command == "createAccount") { //server recieved  request, is sending back response
        createAccountCont(data);
    } else if (command == "resend") { //server recieved  request, is sending back response
        if (data == "emailfail") {
            chrome.runtime.sendMessage({ command: "status", message: "Error connecting to mailserver." }); //errors if status is not visible
        }
    } else if (command == "install" && data == "success") { //server recieved  request, is sending back response
        installSuccess();
    } else if (command == "status") { //server recieved  request, is sending back response
        chrome.runtime.sendMessage({ command: "status", message: data }); //errors if status is not visible
    } else if (command == "getDBbs") { //server recieved  request, is sending back response
        compareAll(data);
    } else if (command == "deleteOPs") { //server recieved  request, is sending back response
        //deleteOPsCont();  //re-install
        chrome.runtime.sendMessage({ command: "status", message: "History deleted.  Uploading fresh bookmarks."}); //errors if status is not visible
        installStart();

    } else { //broadcast the data across all files/windows (Its usually a status message - if the page open has a status handler it will display it
        
        if(data.trim() != ''){  //is there something to show?
            console.log(data);
            sendStatus(data);
            
        }
    }
    //     // failures++;

    return true;
}
////////////////////////////////////////////////// Start Execution /////////////////////////////////////////////////////////////////////////////////////
console.log("processing background.js");

chrome.runtime.onMessage.addListener(handleMessage); //handle the above messages - needs to be done here so we can handle accepting opt in  //not loading for some reason....


checkOptIn(); //if we do not pass the opt-in check, do not enable the addon
    
//automatical update every 15 minutes
  var interval = 15 * 60 * 1000;  //15 minutes
  //var interval = 10000;
  // setInterval(updateStart, interval);   //check for changes every 15 minutes.  Allows 2 browsers to make changes simotaneously