

// Rdio
var config = {
	rdio_api_key : "mpyfjkfbbetkx4j6y8g6z5dg",
	rdio_api_shared : "gg2QmFUfY2",
	callback_url : 'http://localhost:8888/rdiocallback'
}
var rdio = require('rdio')(config);

// Spotify
var SpotifyWebApi = require('spotify-web-api-node');
var spotifyApi = new SpotifyWebApi({
  clientId : '1258793184c042e0aceff3ea973b5ba3',
  clientSecret : '3a403ffd04414807aaeb3c731d80c93b'
  //redirectUri: 'http://localhost:8888/callback'
});

// Server
var cp = require("child_process");
var express = require('express');
var app = express();

var rdio_token, rdio_secret, rdio_verifier;

app.get('/rdiocallback', function(req, res) {
	console.log('Verifying Auth...');
	rdio_verifier = req.query.oauth_verifier;
	rdio_token = req.query.oauth_token;

	rdio.getAccessToken(rdio_token, rdio_secret, rdio_verifier, function(error, oauth_token, oauth_token_secret, results) {
		if (!error) {
			console.log('Rdio_Access granted');
			rdio_token = oauth_token;
			rdio_secret = oauth_token_secret;

			// Get Spotify Credentials
			spotifyApi.clientCredentialsGrant()
			  .then(function(data) {
			    console.log('The access token expires in ' + data['expires_in']);
			    console.log('The access token is ' + data['access_token']);

			    // Save the access token so that it's used in future calls
			    spotifyApi.setAccessToken(data['access_token']);

			    // Make requests to Rdio for Artists and compare with Spotify
			    followRdioArtistsOnSpotify(res);

			  }, function(err) {
			        console.log('Something went wrong when retrieving an access token', err);
			  }).catch(function(error) {
			  		console.error(JSON.stringify(error));
			  		res.status(500).end();
			  });

		} else {
			console.error('Access Error: '+JSON.stringify(error));
			res.status(500).end();
		}
	});
});

var port = 8888;
app.listen(process.env.PORT || port);
console.log("Now listening on port "+port);




// Login to Rdio
console.log('Attempt login to Rdio');
rdio.getRequestToken(function(error, oauth_token, oauth_token_secret, results) {
	if (!error) {
		rdio_secret = oauth_token_secret;
		var login_url = results.login_url + '?oauth_token=' + oauth_token;
		console.log(login_url);
		cp.exec("open '"+login_url + "'"); // open browser.. MAY NOT WORK ON WINDOWS
	} else {
		console.log('Error: '+ error.statusCode);
		if (error.data.indexOf('!DOCTYPE html') > -1) {
			var fs = require('fs');
			fs.writeFile("error.html", error.data, function(err) {
			    if(err) {
			        return console.log(err);
			    } else {
			    	cp.exec("open 'error.html'");
			    }
			}); 
		}
	}
});


function followRdioArtistsOnSpotify(res) {

	rdio.api(rdio_token, rdio_secret, {
	    method: 'getArtistsInCollection',
	    //count: '4'
	}, function(error, results) {
		console.log('Found Rdio artists. Matching...');
		if (!error) {
			results = JSON.parse(results);
			var artists = results.result;
			//console.log(tracks);
			var artistWidgetHTML = "";

			var numRequests = 0;
			artists.forEach(function(artist) {
				
				numRequests++;
				// Loop through Rdio Artists and try to find match in Spotify dataset
				spotifyApi.searchArtists(artist.name).then(function(matches) {
					
					numRequests--;
					if (artist.name !== "Various Artists") {
						console.log(artist.name+" "+artist.artistKey);
						var artistMatch = {name : ""};
						var i = 0;
						while (artist.name.toLowerCase() !== artistMatch.name.toLowerCase() ) {
							artistMatch = matches.artists.items[i++]
							console.log("matches: "+artistMatch.name);
							if (i >= matches.artists.items.count ) break;
						}


						if (artist.name.toLowerCase() === artistMatch.name.toLowerCase()) {

							artistWidgetHTML += '<iframe src="https://embed.spotify.com/follow/1/?uri=spotify:artist:'+ artistMatch.id +'&size=detail&theme=light" width="300" height="56" scrolling="no" frameborder="0" style="border:none; overflow:hidden;" allowtransparency="true"></iframe>';
							console.log('numRequests - '+numRequests);

						} else {
							console.log("Could not find match.");
						}
					}
					if (numRequests == 0) { 
						composeHTML(artistWidgetHTML, res) 
					};
				});
			});

		} else {
			console.log(error);
		}
	});
}

function composeHTML(widgetHTML, res) {
	var html = "<html>" +
			"<head><title='Follow Your Rdio Artists on Spotify'</title></head>" +
			"<body>" +
			widgetHTML +
			"</body>" +
			"</html>";

			res.send(html);
}


