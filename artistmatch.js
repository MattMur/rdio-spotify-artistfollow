

var port = process.env.PORT || 8001;

// Rdio
var config = {
	rdio: {
		clientId : "72atj6m5sbgbdeoc2cwv47275e",
		clientSecret : "4OBw-Wp6WW0UzN4c7c7vKg",
		redirectUri : 'http://localhost:' + port + '/rdiocallback'
	}
}
var Rdio = require('rdio')(config);

var timeoutAfter = require('timeout-after');
function unpromiseWithTimeout(promise, callback) {
	var timeoutCallback = timeoutAfter(5000, callback);
	promise.then(function(data) { timeoutCallback(null, data); }, timeoutCallback).catch(timeoutCallback);
}

// Spotify
var SpotifyWebApi = require('spotify-web-api-node');
var spotify = new SpotifyWebApi({
	clientId : '1c8dbe7ff1d745a0805f9ce6a7c5da09',
	clientSecret : '63d6a1d255694546ba4077f01a3d4581',
	redirectUri: 'http://localhost:' + port + '/spotifycallback'
});

// Server
var open = require("open");
var express = require('express');
var app = express();

var rdio;
var spotifyUser;

var count = 0;

app.get('/rdiocallback', function(req, res) {
	console.log('Verifying Auth...');
	rdio = new Rdio();
	rdio.getAccessToken({code: req.query.code, redirect: config.rdio.redirectUri}, function(error) {
		if (!error) {
			console.log('Rdio_Access granted');


			// res.end(makePage('<a href="' + spotify.createAuthorizeURL(['user-follow-modify'], 'state-not-really-needed') + '">Now login to spotify</a>'));
			res.redirect(spotify.createAuthorizeURL(['user-follow-modify'], 'state-not-really-needed'));


		} else {
			console.error('Access Error: '+JSON.stringify(error));
			res.status(500).end();
		}
	});
});

app.get('/spotifycallback', function(req, res) {
	console.log('Verifying Auth...');
	// Get Spotify Credentials
	spotify.authorizationCodeGrant(req.query.code)
	.then(function(authres) {
		var data = authres.body;
		console.log('The access token expires in ' + data['expires_in']);
		console.log('The access token is ' + data['access_token']);

		// Save the access token so that it's used in future calls
		// spotify.setAccessToken(data['access_token']);
		spotifyUser = new SpotifyWebApi({
			accessToken: data['access_token']
		});

		res.redirect("/follow/1");

	}, function(err) {
		console.log('Something went wrong when retrieving an access token', err);
	}).catch(function(error) {
		console.log("caught error");
		console.log(error);
		console.error(JSON.stringify(error));
		res.status(500).end();
	});

});

app.get("/follow/:page", function followRdioArtistsOnSpotify(req, res) {
	var page = (+req.params.page - 1) || 0;
	rdio.request({
		method: 'getArtistsInCollection',
		sort: 'name',
		count: '50',
		start: page * 50
	}, function(error, results) {
		console.log('Found Rdio artists. Matching...');
		if (!error) {
			var artists = results.result;
			//console.log(tracks);
			var artistWidgetHTML = "";
			var artistIds = [];

			var numRequests = 0;
			artists.forEach(function(artist) {

				if (artist.name === "Various Artists") {
					return;
				}

				numRequests++;
				// Loop through Rdio Artists and try to find match in Spotify dataset

				unpromiseWithTimeout(spotify.searchArtists(artist.name), function (err, searchres) {
					numRequests--;
					var matches = searchres.body;
					if (!err) {
						console.log(artist.name+" "+artist.artistKey);
						var artistMatch = {name : ""};
						var i = 0;
						while (artist.name.toLowerCase() !== artistMatch.name.toLowerCase() ) {
							artistMatch = matches.artists.items[i++]
							console.log("matches: "+artistMatch.name + " (id: " + artistMatch.id + ")");
							if (i >= matches.artists.items.count ) break;
						}

						if (artist.name.toLowerCase() === artistMatch.name.toLowerCase()) {

							artistWidgetHTML += '<iframe src="https://embed.spotify.com/follow/1/?uri=spotify:artist:'+ artistMatch.id +'&size=detail&theme=light" width="300" height="56" scrolling="no" frameborder="0" style="border:none; overflow:hidden;" allowtransparency="true"></iframe>';
							artistIds.push(artistMatch.id);
							console.log('numRequests - '+numRequests);

						} else {
							console.log("Could not find match.");
						}
					} else {
						console.log("Error: " + err);
					}

					if (numRequests == 0) {
						// done
						console.log("Following artists...");
						console.log(JSON.stringify(artistIds));
						unpromiseWithTimeout(spotifyUser.followArtists(artistIds), function(err) {
							var nextPage = page + 2;
							console.log("Displaying page...");

							if (err) console.log(err);

							var pageSource = makePage(
								(err ? '<h2 style="color: red;">Could not automatically follow</h2>' : '<h2>Followed the following artists</h2>') + artistWidgetHTML +
								'<div><h3><a href="/follow/' + nextPage + '">Next Page of Follows</a></h3></div>' +
								'<div><a href="https://play.spotify.com/collection/artists" target="_blank">Check your artists</a></div>'
							);

							console.log("page size: " + pageSource.length);

							res.send(pageSource);
						});
					};
				});
			});
		} else {
			console.log(error);
		}
	});
});

function makePage(html) {
	return ('<!DOCTYPE html><html><head>'+
		'<title>Follow Your Rdio Artists</title></head><body>' + html +
		'</body></html>'
	);
}

app.listen(port);
console.log("Now listening on port "+port);

// Login to Rdio
console.log('Attempt login to Rdio');
open('https://www.rdio.com/oauth2/authorize?response_type=code&client_id=' + config.rdio.clientId + '&redirect_uri=' + config.rdio.redirectUri);
