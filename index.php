<head>
  <meta charset="utf-8"><!--http://stackoverflow.com/questions/5257866/addclass-and-removeclass-not-working-in-internet-explorer?rq=1   EDIT: No difference seen-->
  <meta http-equiv="X-UA-Compatible" content="IE=Edge;chrome=1">

    <link href="css/style.css" type="text/css" rel="stylesheet" />

    <title>Sync bookmarks between Firefox and Chrome</title>
    <meta description="Sync bookmarks between firefox and chrome" contents="Sync bookmarks between firefox and chrome." />
    <script src="js/jquery.min.js"></script>
	<script src="js/mousehandlers.js"></script>
    <?php
	include('settings.php');
	?>

    <!-- Global site tag (gtag.js) - Google Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=UA-130855312-1"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
    
      gtag('config', 'UA-130855312-1');
    </script>


</head>
<body style="padding-left:20px; padding-right:20px; border-left:20px solid lightblue; border-right:20px solid lightblue; border-bottom:20px solid lightblue;">


<h1>Daxmarks.com</h1> 
<h2>Announcing Daxmarks 2.0!  Coming in the next few weeks!</h2>
<p>Daxmarks is a web browser extension that automatically syncs your bookmarks between Firefox,  Chrome, and now (possibly) Microsoft Edge (Edge never works how its supposed to). It  works between browsers anywhere in the world.</p>
<p>PLEASE BACKUP/<a href="backup_bookmarks.html">EXPORT your bookmarks</a> before installing, just in case something goes wrong.</p>
<p>If you already use one of these browsers, just install the other one, and after installing my addon, all bookmarks should automatically show up in the new browser.  <a href="mailto:john@daxmarks.com?Subject=A message from Daxmarks.com">Let me know</a> if that does not happen! </p>
<p> <u>Any</u> problems at all, <b> please</b> email me at john@daxmarks.com!</p>

<p>&nbsp;</p>
<h2>Installation:</h2>
<p>I assume you already use <a href="https://www.google.com/chrome/" >Chrome</a> and <a href="https://www.mozilla.org/en-US/firefox/new/">Firefox</a>.  Get daxmarks for each.</p>
<p>Get the firefox version here:</p>
<p><a href="https|//addons.mozilla.org/en-US/firefox/addon/daxmarks-beta/">https://addons.mozilla.org/en-US/firefox/addon/daxmarks-beta/</a></p>
<p>And the chrome version here:</p>
<p><a href="https://chrome.google.com/webstore/detail/daxmarks-beta/hlmgckdkfeddmlncefcmjmoajbobhnob">https://chrome.google.com/webstore/detail/daxmarks-beta/hlmgckdkfeddmlncefcmjmoajbobhnob</a></p>
<p>The process is automated.  That should be all that is required.</p>
  <br>
<p>Manual Installation instructions <a href="manual_installation.html">here</a>.</p>
<p>&nbsp;</p>
<h2>Usage:</h2>
<p>An Icon should appear at the top of the browser.</p>
<p> <img src="img/icon_96_on.png" width="96" height="96"><br />
</p>
<p>Click on the icon, click on 'Register for new account'. Follow the instructions.</p>
<p>Once an account is created, click on the icon and log into your account.</p>
<p>At this point all bookmarks should automatically sync between browsers.  You should not have to log in again unless you log out or delete your cache.<br />




				<form id='commentboxform' action="" method="post"  class="whitetext" title="Your Feedback">
					<div title="Feedback">Report any bugs or suggestions here. <br /> Please describe what happened, the expected behavior, and the steps required to reproduce the problem.</div>
				
                <table><td><tr>

        <textarea id='commentbox' cols='75' rows='5' name='message'></textarea>
        </tr></td><br />
    	<td><tr>
        <span style='font-size:x-small;'> (include your email if you want a reply)</span>
        </tr></td></table>
        	<input id='send_message' type="submit" name="send_message" value="Send Message" />

        </form>

             <br>
             <hr>
             <div class="whitetext">
             Daxmarks
             Version <?php echo $SETTINGS['version'] ?> 
             <br>
           Created by <a href="http://johnktejik.info">John Ktejik</a>		  <br>
           <?php
							// outputs e.g.  somefile.txt was last modified: December 29 2002 22:16:23.
							$filename = __FILE__;
							if (file_exists($filename)) {
							    echo "<br><span style='font-size:x-small;'> This page was last modified: " . date ("F d Y ", filemtime($filename)) . "</span>";
							}
						?>
           </div>
           
           </body>