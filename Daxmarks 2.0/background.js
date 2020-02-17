// All Execution Starts here
//any messages between the login/register/main screens and the main functions.js has to go through here as a broadcast message
function handleMessage(request, sender, sendResponse) {
    console.log("Message from the content script: " + sender.url + "," + request.command);
    console.log(sender);
    console.log(request);
    switch (request.command) {
        case "login":
            showLoginScreen();
            break;
        case "loginSubmit":
            _email = request.email; //set globals to values they filled in which are sent with every php message
            _password = request.password;
            if (!_clientID) { // sometimes the opin Errors... startup doesn't get called.  Not sure why.
                startup();
            } else {
                login();
            }
            break;
        case "startup":
            startup();
            break;
        case "optin":
            optin();
            break;
        case "install":
            installStart(); //not really install, so much as first use
            break;
        case "updateAll":
            forceUpdate();
            break;
        case "update":
            updateStart();
            break;
        case "forceSync":
            forceSyncStart();
            
            break;
        case "autoupdate":
            if (_DEBUG) return; //don't auto update if debugging
            updateFromOpsStart();
            break;
        case "renametest":
            renametest();
            break;
        case "printtree":
            printtree();
            break;
        case "register":
            showRegisterScreen();
            break;
        case "registerSubmit":
            sendResponse("Creating account " + request.email + "<br>");
            createAccount(request.email, request.password);
            break;
        case "logout":
            logout();
            break;
        case "forgotpassword":
            showResetPasswordScreen();
            break;
        case "resetPassword":
            resetPassword(request); //contact servers
            break;
        case "resendvalidation":
            resendvalidation();
            break;
        case "forceValidate":
            forceValidate();
            break;
        case "showregisterscreen":
            showRegisterScreen();
            break;
        case "clearall":
            clearall();
            break;
        case "rebuildBookmarks":
            sendStatus("rebuild bookmarks");
            rebuildBookmarks();
            break;
        case "rebuildServerBookmarks":
            sendStatus("rebuildServer");
            sendToPhp("rebuildServer");
            break;
        case "removeDuplicates":
            sendStatus("removing duplicate bookmarks and merging duplicate folders");
            removeDuplicates();
            break;
        case "compareall":
            getDBbs();
            break;
        case "runtest":
            test1();
            break;
        case "processOpsToServer":
            sendStatus("processing " + _opsToServer.length + " operations.");
            processOpsToServer();
            break;
        case "test4":
            test4();
            break;
        case "requestCount":
            sendResponse(count(_localTreeAssoc));
            break;
        case "deleteTables":
            deleteTablesStart();
            break;
        case "cleanup":
            sendToPhp("cleanup");
            break;
    }
}
//ALL Commands to server goes through here
function sendToPhp(command, data = " ") {
    var postUrl = 'https://www.daxmarks.com/listener2.php'; //ssl!
    if (_DEBUG) {
        var postUrl = 'http://localhost/daxmarks/listener2.php';
    }
    try {
        if (typeof _email != 'string' || typeof _password != 'string') { //these get set if they click login submit, and saved when login completes
            console.log("Error -= email/password is not string");
            return;
        }
        if(_email == "" || _password == ""){
            console.log("not logged in.");
            stopTimer();
            return;
        }

        data = JSON.stringify(data); //turn into big string
        data = encodeURIComponent(data); //required, decoded automatically in PHP $_POST
        outstring = "&command=" + command + "&email=" + _email + "&password=" + _password + "&clientID=" + _clientID + "&localTimestamp=" + Date.now() + "&lastUpdate=" + _lastUpdate + "&data=" + data;
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
        console.log("SENDING: " + outstring.length + " characters. Command="+command);
        //console.log(outstring + " \n");

        //xhr.send("&test1=test1");
        xhr.send(outstring);
        // _outstring = outstring;
        
        // blinkIcon()
        toggleIcon();
    } catch (err) {
        console.log(err);
    }
}
//All communcation from server goes through here
function recieveFromPhp(xhr) {
    toggleIcon(); //it should turn green when sending, back to yellow when recieiving, and since every send should have a recieive, it should always end up ok. //and yet.... grr
    console.log("RECEIVING:" + xhr.responseText.length);
    if ((xhr.responseText).trim() == "") {
        // if (xhr.responseText == "") {
        console.log("empty message");
        chrome.runtime.sendMessage({ command: "status", message: "Error.  Server not responding." });
        return;
    }
    var json = parseJson(xhr.responseText);
    var command = json.command;
    var message = json.message;
    var serverTimestamp = json.serverTimestamp;
    var data = json.data;
    
    console.log("return command: '" + command + "'");
    if (command == "updateFromOpsResults") { //did we find stuff to add to client?
        if (!data || data == "") { //no data sent
            console.log("Up to date.");
            sendStatus("Up to date.");
            //chrome.runtime.sendMessage({ command: "close"});   //should close in 5 seconds  //no it closes main menu :/
            return; //nothing to do here
        }
        processOpsFromServer(data, serverTimestamp); //else apply these operations
    } else if (command == "forceSync") { //did we find stuff to add to client?
        forceSync(data);
    } else if (command == "processOpsToServer") { //server recieved queue, set firsttime = false
        message = removeContradictoryOps(message);
        processOpsFromServer(message,serverTimestamp); //we sent local operations to server and got a response, we can apply and updates from server to client.  //this needs to be done FIRST, before we send anything else, because of the updateTime. 
        // If we don't updateTime first, the next send will get the operations we just added as 'new' ops!
        processQueueSuccess(data);

    } else if (command == "login") { //server recieved login request, is sending back response
        stopTimer();
        loginCont(message);

    } else if (command == "createAccount") { //server recieved  request, is sending back response
        createAccountCont(message);
    } else if (command == "resend") { //server recieved  request, is sending back response
        if (data == "emailfail") {
            sendStatus("Error connecting to mailserver.");
        }
        // } else if (command == "install") { //server recieved  request, is sending back response
        //     //installSuccess(data);
        //     processQueueSuccess(data);
    } else if (command == "status") { //server recieved  request, is sending back response
        sendStatus(message);
    } else if (command == "getDBbs") { //server recieved  request, is sending back response
        compareAll(data); //testing.js
    } else if (command == "deleteOPs") { //server recieved  request, is sending back response
        //deleteOPsCont();  //re-install
        sendStatus("History deleted.  Uploading fresh bookmarks."); //errors if status is not visible
        installStart();
    } else if (command == "FATALERROR" || command == "ERROR") {
        sendStatus("FATAL ERROR");
        console.log(message);
        sendStatus(message);
        resetVariables();
        if (data == "out of memory") {
            //we need to split up the queue.
            console.log("OUT OF MEMORY");
            sendStatus("Out of Memory");
            console.log(_opsToServer.length);
        }
    } else if (command == "getBsWithTitle") {
        getBsWithTitleCont(data);
    } else if (command == "getOpsWithTitle") {
        getOpsWithTitleCont(data);
    } else if (command == "addedId") {

    } else if (command == "deleteTables") {
        deleteTables();

        //no need to do anything - just catch it so we don't keep sending status 'sucess'
    } else { //broadcast the data across all files/windows (Its usually a status message - if the page open has a status handler it will display it
        if (message && message === String(message) && message.trim() != '') { //is there something to show?
            console.log(message);
            sendStatus(message);
        }
    }
    //     // failures++;
    return true;
}

function parseJson(s) {
    var command, data, message, serverTimestamp;
    try {
        s = findJson(s);
        var response = JSON.parse(s);
        console.log("json parsed data");
        console.log(response);
        if (response) { //if there are 2 parts to the response...
            command = response[0]; //the 1nd part is the command
            message = response[1];
            data = response[2];
            if (response[3] != '') {
                //console.log("Debug Message: " + response[2]);
                console.log("Debug Message: " + response[3]);
            }
            localTimestamp = response[4];  //used as an id to link send data with returning
            serverTimestamp = response[5];  //used to updateTime
        }
    } catch (err) {
        console.log("error parsing json");
        console.log(err);
        console.log(s);
        // return;
        command = "";
        message = s; //this just sends everything as a status update
        stopTimer();
    }
    output = { command: command, message: message, data: data, serverTimestamp: serverTimestamp };
    return output;
}

function findJson(s) { //usually a error puts text into response, making json parsing break.  Remove it
    s = s.substring(s.indexOf('["'));
    return s;
}
////////////////////////////////////////////////// Start Execution /////////////////////////////////////////////////////////////////////////////////////
console.log("processing background.js");
chrome.runtime.onMessage.addListener(handleMessage); //handle the above messages - needs to be done here so we can handle accepting opt in  
if (_DEBUG) { //skip opt in
    console.log("DEBUG is On.");
    showLoginScreen();
    startup();
} else {
    checkOptIn(); //if we do not pass the opt-in check, do not enable the addon
    //automatical update every 15 minutes
    var interval = 15 * 60 * 1000; //15 minutes
    //var interval = 10000;
    setInterval(updateFromOpsStart, interval); //check for changes every 15 minutes.  Allows 2 browsers to make changes simotaneously
}