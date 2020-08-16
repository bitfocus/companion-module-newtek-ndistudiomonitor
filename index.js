let instance_skel = require('../../instance_skel');
let actions       = require('./actions');
let presets       = require('./presets');
let feedbacks     = require('./feedbacks');
let crypto        = require('crypto');
let utility       = require('utility');
let log;
let debug;

class instance extends instance_skel {

	constructor(system, id, config) {
		super(system, id, config)
		var self = this;
		Object.assign(self, {
			...actions,
			...presets,
			...feedbacks
		});
	}

	actions(system) {
		var self = this;
		self.setActions(self.getActions());
	}

	// Check instance configuration
	checkConfig() {
		var self = this;
		if (self.config.host !== undefined && self.config.port !== undefined && self.config.useWebPassword !== undefined && self.config.username !== undefined && self.config.password !== undefined) {
			self.auth.userpass = self.config.username + ':' + self.config.password;
			self.initConnection();
		} else {
			self.system.emit('log', 'NDI Studio Monitor', 'error', 'Failed applying instance settings, missing parameters');
			self.status(self.STATUS_ERROR, 'Missing config parameters');
		}
	}

	// Initiate the connection to NDI Studio Monitor
	initConnection() {
		var self = this;
		if (!self.waitingForResponse) { // Prevent double firing of the connect() function
			self.connect();
		}
	}

	// Try to connect againg
	retryConnection() {
		var self = this;
		if (self.timers.reconnectTimeout) {
			clearTimeout(self.timers.reconnectTimeout);
			self.timers.reconnectTimeout = null;
		}
		self.timers.reconnectTimeout = setTimeout(function(){ self.connect(); }.bind(self), 1000);
	}

	// Do the real connection to NDI Studio Monitor
	// NOTE: this is a bit complicated because NDI Studio Monitor could use (or not) digest-auth and is also returning an empty realm in wwwAuthenticate which is non-standard
	connect() {
		var self = this;
		self.status(self.STATUS_WARNING, 'Connecting...');

		// Clear polling intervals because first we need a valid connection (maybe NDI Studio Monitor has been closed and initConnection() was fired after an error)
		if (self.timers.pollSources) {
			clearInterval(self.timers.pollSources);
			self.timers.pollSources = null;
		}
		if (self.timers.pollConfiguration) {
			clearInterval(self.timers.pollConfiguration);
			self.timers.pollConfiguration = null;
		}
		if (self.timers.pollRecording) {
			clearInterval(self.timers.pollRecording);
			self.timers.pollRecording = null;
		}
		// This should never happen because retryConnection() is taking care of it. Leaving it here anyway
		if(self.timers.reconnectTimeout) {
			clearTimeout(self.timers.reconnectTimeout);
			self.timers.reconnectTimeout = null;
		}

		var path = '/';
		var url = 'http://' + self.config.host + ':' + self.config.port + path;

		// First request (without any extra header); if NDI Studio Monitor requires a web password we will get an HTTP 401 and store www-authenticate headers
		self.waitingForResponse = true;
		self.system.emit('rest_get', url, function (err, result) {
			if(self.active) {        // Prevent response handling if instance have been disabled while waiting for a response
				if (err !== null) {     // Something bad happened, mainly an ECONNREFUSED if NDI Studio Monitor is not running or unreachable
					self.status(self.STATUS_ERROR, result.error.code);
					self.log('error', 'Connection failed (' + result.error.code + ')');
					self.retryConnection();     // Keep trying to connect
				}
				else {
					if(result.response.statusCode == 200) {     // NDI Studio Monitor is not requiring a web password
						self.auth.passwordMandatory = false;
						self.waitingForResponse = false;
						if(!isNDIStudioMonitorResponse(result.data)) {      // Check if the response if from NDI Studio Monitor
							self.log('warn', 'Unespected response after connection');   // We can't be 100% sure so just put a warn in the log
						}
						if(self.config.useWebPassword === true) {     // Not expected because self.config.useWebPassword is true, but everything should work anyway
							self.status(self.STATUS_OK);    // Everything will work, no reason to raise a warning on the instance
							self.log('warn', 'Web password is not required');    // Just notify the user that web password is being ignored
							self.startPolling();     // Start to poll for sources, configuration and recording status
						} else { // Everything is fine
							self.status(self.STATUS_OK);
							self.startPolling();     // Start to poll for sources, configuration and recording status
						}
					} else if(result.response.statusCode == 401) {     // This is ok, NDI Studio Monitor may require a web password
						self.auth.passwordMandatory = true;
						if(self.config.useWebPassword === false) {     // We need to use the web password but in instance config "Use web password" is not checked
							self.status(self.STATUS_ERROR, "Web password is required for login");
							self.log('error', 'Web password is required for login');
							self.waitingForResponse = false;
						} else {     // This is correct, we want to get 401 to get www-authenticate headers if using web password
							self.status(self.STATUS_WARNING, "Logging in...");
							self.auth.wwwAuthenticate = result.response.headers['www-authenticate']; // Store www-authenticate headers

							// Second request, this time we add the "Authorization" header
							self.system.emit('rest_get', url, function (err, result) {
								if(self.active) {       // Prevent response handling if instance have been disabled while waiting for a response
									if (err !== null) {     // Something really bad happened, mainly an ECONNREFUSED if NDI Studio Monitor has been closed or became unreachable after the first connection
										self.status(self.STATUS_ERROR, result.error.code);
										self.log('error', 'Connection failed (' + result.error.code + ')');
										self.retryConnection();
									}
									else {
										self.waitingForResponse = false;
										if(result.response.statusCode == 401) {     // Login failed, username and password are wrong
											self.status(self.STATUS_ERROR, "Login failed, wrong username or password");
											self.log('error', 'Login failed, wrong username or password');
										} else if(result.response.statusCode == 200) {     // Login success
											self.status(self.STATUS_OK);
											if(!isNDIStudioMonitorResponse(result.data)) {      // Check if the response if from NDI Studio Monitor
												self.log('warn', 'Unespected response after connection');   // We can't be 100% sure so just put a warn in the log
											}
											self.startPolling();     // Start to poll for sources, configuration and recording status
										} else {     // This is unespected
											self.status(self.STATUS_ERROR, "Unespected HTTP status code: " + result.response.statusCode);
											self.log('error', "Unespected HTTP status code: " + result.response.statusCode);
											self.retryConnection();
										}
									}
								} else {     // Instance has been disabled, "fail" silently
									self.waitingForResponse = false;
								}
							}, {
								// Extra headers for rest_get
								Authorization: self.getDigestAuthHeader(result.response.req.method, result.response.req.path, self.auth.wwwAuthenticate, self.auth.userpass)
							});
						}
					} else {     // This is unespected
						self.status(self.STATUS_ERROR, "Unespected HTTP status code: " + result.response.statusCode);
						self.log('error', "Unespected HTTP status code: " + result.response.statusCode);
						self.retryConnection();
					}
				}
			} else {     // Instance has been disabled, "fail" silently
				self.waitingForResponse = false;
			}
		});
	}

	// Poll for NDI Studio Monitor sources/configuration/recording
	startPolling() {
		var self = this;

		// Do immediately the requests
		self.getCurrentNDISources();
		self.getCurrentConfiguration();
		self.getCurrentRecordingStatus();

		// Repeat the requests at set intervals
		self.timers.pollSources         = setInterval(self.getCurrentNDISources.bind(self), 5000);             // No need to poll aggressively
		self.timers.pollConfiguration   = setInterval(self.getCurrentConfiguration.bind(self), 1000);        // This will be used mainly to get active sources
		self.timers.pollRecording       = setInterval(self.getCurrentRecordingStatus.bind(self), 1000);        // Milliseconds will be discarded, no need to poll faster than 1 second
	}

	// Get NDI sources available in NDI Studio Monitor
	getCurrentNDISources() {
		var self = this;
		var path = '/v1/sources';
		var url = 'http://' + self.config.host + ':' + self.config.port + path;

		// If using web password we must set the appropriate Authorization header
		var extraHeaders = {};
		if(self.auth.passwordMandatory & self.config.useWebPassword) {
			if(self.auth.wwwAuthenticate === null) {
				self.initConnection();
				return;        // Can't go on with the function because first we need to get a valid connection; polling will resume after a successfull connection
			} else {
				extraHeaders.Authorization = self.getDigestAuthHeader('GET', path, self.auth.wwwAuthenticate, self.auth.userpass);
			}
		}

		// Send GET request to get a list of all sources (NDI, audio devices, screens, controllers...)
		self.system.emit('rest_get', url, function (err, result) {
			if (err !== null) {
				self.initConnection();        // Something went wrong, check againg the connection
			}
			else {
				if(result.response.statusCode == 200) {
					var newPresets = self.getPresets();        // Presets will be added to the basic ones

					var sources = getSafe(() => result.data.ndi_sources);

					// Store NDI sources
					if(sources !== undefined) {
						self.pollResults.ndiSources.length = 0;        // Wipe previous sources array

						// First source must always be an empty one (this is how NDI Studio Monitor sets the source to "None")
						// but is never listed in /v1/sources response so we are putting it back at the beginning of the response array.
						// In this way actions options and presets will be automatically created accounting for the "None" source.
						sources.unshift('');

						for (var n in sources) {
							var sourceName = sources[n];

							// Take care to give sources a meaningful name for the user
							var displayedText = sourceName;
							if(displayedText === '') {
								displayedText = 'None';        // If the source is an empty string, the button text should be "None" (according to NDI Studio Monitor nomenclature)
							}

							// Add the source to the array that we will use to populate the drop-down options in the actions
							self.pollResults.ndiSources.push({id: sourceName, label: displayedText});

							// Create a new preset (with feedback) to set the source as the main one
							newPresets.push({
								category: 'Sources',
								label   : sourceName,
								bank: {
									style   : 'text',
									text    : displayedText,
									size    : 'auto',
									color   : self.defaultColors.fg,
									bgcolor : self.defaultColors.bg
								},
								feedbacks: [
									{
										type: 'active_source',
										options: {
											source  : sourceName,
											fg      : self.feedbackColors.active_source.fg,
											bg      : self.feedbackColors.active_source.bg
										}
									}
								],
								actions: [
									{
										action  : 'source',
										options : {source: sourceName}
									}
								]
							});

							// Create a new preset (with feedback) to set the source as Picture in Picture one
							newPresets.push({
								category: 'Overlay PiP',
								label   : sourceName,
								bank: {
									style   : 'text',
									text    : 'Over. PiP: ' + displayedText,
									size    : 'auto',
									color   : self.defaultColors.fg,
									bgcolor : self.defaultColors.bg
								},
								feedbacks: [
									{
										type: 'active_overlay_pip',
										options: {
											source  : sourceName,
											fg      : self.feedbackColors.active_overlay.fg,
											bg      : self.feedbackColors.active_overlay.bg
										}
									}
								],
								actions: [
									{
										action  : 'overlay_pip',
										options : {source: sourceName}
									}
								]
							});

							// Create a new preset (with feedback) to set the source as alpha overlay
							newPresets.push({
								category: 'Overlay alpha',
								label   : sourceName,
								bank: {
									style   : 'text',
									text    : 'Over. alpha: ' + displayedText,
									size    : 'auto',
									color   : self.defaultColors.fg,
									bgcolor : self.defaultColors.bg
								},
								feedbacks: [
									{
										type: 'active_overlay_alpha',
										options: {
											source  : sourceName,
											fg      : self.feedbackColors.active_overlay.fg,
											bg      : self.feedbackColors.active_overlay.bg
										}
									}
								],
								actions: [
									{
										action  : 'overlay_alpha',
										options : {source: sourceName}
									}
								]
							});
						}
						self.status(self.STATUS_OK);
					} else {
						self.status(self.STATUS_WARNING, "Get NDI sources failed");
					}

					// Update presets, feedbacks and actions with new sources
					self.setPresetDefinitions(newPresets);
					self.setFeedbackDefinitions(self.getFeedbacks());
					self.actions();
				} else {
					self.initConnection(); // Something went wrong, check againg the connection
				}
			}
		}, extraHeaders);
	}

	// Get current configuration of NDI Studio Monitor
	getCurrentConfiguration() {
		var self = this;
		var path = '/v1/configuration';
		var url = 'http://' + self.config.host + ':' + self.config.port + path;

		// If using web password we must set the appropriate Authorization header
		var extraHeaders = {};
		if(self.auth.passwordMandatory & self.config.useWebPassword) {
			if(self.auth.wwwAuthenticate === null) {
				self.initConnection();
				return; // Can't go on with the function because first we need to get a valid connection; polling will resume after a successfull connection
			} else {
				extraHeaders.Authorization = self.getDigestAuthHeader('GET', path, self.auth.wwwAuthenticate, self.auth.userpass);
			}
		}

		// Send GET request to get a list of all sources (NDI, audio devices, screens, controllers...)
		self.system.emit('rest_get', url, function (err, result) {
			if (err !== null) {
				self.initConnection();        // Something went wrong, check againg the connection
			}
			else {
				if(result.response.statusCode == 200) {
					if(result.data !== undefined) {
						// Update current active source variable and feedback
						var currActiveSource = getSafe(() => result.data.NDI_source);
						if(currActiveSource !== undefined) {
							if(currActiveSource === '') {
								self.setVariable('activeSourceComplete', 'None');
								self.setVariable('activeSourceHost', 'None');
								self.setVariable('activeSourceName', 'None');
								self.pollResults.activeSource.complete = '';
								self.pollResults.activeSource.host = '';
								self.pollResults.activeSource.name = '';
							} else {
								self.setVariable('activeSourceComplete', currActiveSource);
								self.setVariable('activeSourceHost', getHost(currActiveSource));
								self.setVariable('activeSourceName', getName(currActiveSource));
								self.pollResults.activeSource.complete  = currActiveSource;
								self.pollResults.activeSource.host      = getHost(currActiveSource);
								self.pollResults.activeSource.name      = getName(currActiveSource);
							}
						}
						self.checkFeedbacks('active_source');

						// Update current active PiP source variable and feedback
						var currActiveOverlay = getSafe(() => result.data.NDI_overlay);
						var currOverlayModePiP = getSafe(() => result.data.decorations.picture_in_picture);
						var currAudioMute = getSafe(() => result.data.decorations.mute_audio);
						if(currActiveOverlay !== undefined) {
							if(currActiveOverlay === '') {
								self.setVariable('activeOverlayComplete', 'None');
								self.setVariable('activeOverlayHost', 'None');
								self.setVariable('activeOverlayName', 'None');
								self.pollResults.activeOverlay.complete = '';
								self.pollResults.activeOverlay.host     = '';
								self.pollResults.activeOverlay.name     = '';
							} else {
								self.setVariable('activeOverlayComplete', currActiveOverlay);
								self.setVariable('activeOverlayHost', getHost(currActiveOverlay));
								self.setVariable('activeOverlayName', getName(currActiveOverlay));
								self.pollResults.activeOverlay.complete = currActiveOverlay;
								self.pollResults.activeOverlay.host     = getHost(currActiveOverlay);
								self.pollResults.activeOverlay.name     = getName(currActiveOverlay);
							}
						}
						if(currOverlayModePiP !== undefined) {
							self.pollResults.overlayModePiP = currOverlayModePiP;
						}
						if(currAudioMute !== undefined) {
							self.pollResults.audioMute = currAudioMute;
						}
						self.checkFeedbacks('active_overlay');
						self.checkFeedbacks('active_overlay_pip');
						self.checkFeedbacks('active_overlay_alpha');
						self.checkFeedbacks('audio_mute');

						self.status(self.STATUS_OK);
					} else {
						self.status(self.STATUS_WARNING, "Get configuration failed");
					}
				} else {
					self.initConnection(); // Something went wrong, check againg the connection
				}
			}
		}, extraHeaders);
	}

	// Get current recording status of NDI Studio Monitor
	getCurrentRecordingStatus() {
		var self = this;
		var path = '/v1/recording';
		var url = 'http://' + self.config.host + ':' + self.config.port + path;

		// If using web password we must set the appropriate Authorization header
		var extraHeaders = {}
		if(self.auth.passwordMandatory & self.config.useWebPassword) {
			if(self.auth.wwwAuthenticate === null) {
				self.initConnection();
				return; // Can't go on with the function because first we need to get a valid connection; polling will resume after a successfull connection
			} else {
				extraHeaders.Authorization = self.getDigestAuthHeader('GET', path, self.auth.wwwAuthenticate, self.auth.userpass);
			}
		}

		// Send GET request to get a list of all sources (NDI, audio devices, screens, controllers...)
		self.system.emit('rest_get', url, function (err, result) {
			if (err !== null) {
				self.initConnection(); // Something went wrong, check againg the connection
			}
			else {
				if(result.response.statusCode == 200) {
					// Store current configuration
					if(result.data !== undefined) {
						// Update recording status and feedback
						var currRecording = getSafe(() => result.data.recording);
						if(currRecording !== undefined) {
							self.setVariable('recording', currRecording);
							self.pollResults.recording = currRecording;
						}
						self.checkFeedbacks('recording');

						// Update recording time
						var recDuration = getSafe(() => result.data.duration);
						if(recDuration !== undefined) {
							var time = parseInt(recDuration);
							self.setVariable('recordingTimeS', time);
							var minutes = Math.floor(time / 60);
							var seconds = time - minutes * 60;
							self.setVariable('recordingTimeMS', str_pad_left(minutes, '0', 2) + ':' + str_pad_left(seconds, '0', 2));
						}

						self.status(self.STATUS_OK);
					} else {
						self.status(self.STATUS_WARNING, "Get recording status failed");
					}
				} else {
					self.initConnection(); // Something went wrong, check againg the connection
				}
			}
		}, extraHeaders);
	}

	// Instance configuration
	config_fields() {
		var self = this;
		return [
			{
				type    : 'text',
				id      : 'info',
				width   : 12,
				label   : 'Information',
				value   : '<b>Control for NDI Studio Monitor version > 4.<br/>For info and tips about password and how this module works (actions, feedbacks, variables, presets, custom JSON) please see the help section of the module</b>'
			},
			{
				type    : 'textinput',
				id      : 'host',
				label   : 'Host or IP:',
				width   : 12,
				default : '',
				regex   : self.REGEX_SOMETHING
			},
			{
				type    : 'number',
				id      : 'port',
				label   : 'Port: (default 80)',
				width   : 12,
				default : '80',
				min     : 1,
				max     : 65535,
				regex   : self.REGEX_PORT
			},
			{
				type    : 'checkbox',
				id      : 'useWebPassword',
				width   : 12,
				label   : 'Use web password',
				default : true
			},
			{
				type    : 'textinput',
				id      : 'username',
				label   : 'Web user: (default admin)',
				width   : 12,
				default : 'admin'
			},
			{
				type    : 'textinput',
				id      : 'password',
				label   : 'Web password: (default admin)',
				width   : 12,
				default : 'admin'
			}
		];
	}

	// Instance actions
	action(action) {
		var self    = this;
		let id      = action.action;
		let opt     = action.options;
		let NDIobj  = {};
		let page    = '';

		switch (id) {
			case 'source':
				page                = 'configuration';
				NDIobj.NDI_source   = opt.source;
				break;

			case 'overlay_pip':
				page                = 'configuration';
				NDIobj.NDI_overlay  = opt.source;
				NDIobj.decorations  = { "picture_in_picture" : true};
				break;

			case 'overlay_alpha':
				page                = 'configuration';
				NDIobj.NDI_overlay  = opt.source;
				NDIobj.decorations  = { "picture_in_picture" : false};
				break;

			case 'overlay_hide':
				page                = 'configuration';
				NDIobj.NDI_overlay  = "";
				break;

			case 'audio_mute':
				page                = 'configuration';
				NDIobj.decorations  = { 'mute_audio' : true };
				break;

			case 'audio_unmute':
				page                = 'configuration';
				NDIobj.decorations  = { 'mute_audio' : false };
				break;

			case 'rec_start':
				page                = 'recording';
				NDIobj.recording    = true;
				break;

			case 'rec_stop':
				page                = 'recording';
				NDIobj.recording    = false;
				break;

			case 'customJSON':
				page                = 'configuration';
				try {
					NDIobj          = JSON.parse(opt.customJSON);
				} catch(e) {
					if (e instanceof SyntaxError) {
						// Is it worth to notify the user that the JSON string is not valid?
					}
				}
				break;
		}

		self.sendCommand(NDIobj, page);
	}

	sendCommand(NDIobj, page) {
		var self = this;
		var path = '/v1/' + page; //page could be one of: reconding configuration sources
		var url = 'http://' + self.config.host + ':' + self.config.port + path;
		if(page == 'configuration' && NDIobj.version === undefined) {
			NDIobj.version = 1;
		}
		var data = JSON.stringify(NDIobj);

		debug("NDIobj is: \n"+data);

		// If using web password we must set the appropriate Authorization header
		var extraHeaders = {}
		if(self.auth.passwordMandatory & self.config.useWebPassword) {
			if(self.auth.wwwAuthenticate === null) {
				self.initConnection();
				// TODO: action will fail with HTTP 401 because extraHeaders are not ready
			} else {
				extraHeaders.Authorization = self.getDigestAuthHeader('POST', path, self.auth.wwwAuthenticate, self.auth.userpass);
			}
		}

		// Send POST request
		self.system.emit('rest', url, data, function (err, result) {
			if (err !== null) {
				self.initConnection(); // Something went wrong, check againg the instance connection
			}
			else {
				if(result.response.statusCode == 200) {
					if(String(result.data).trim() != 'Configuration updated.') {
						// This should never happen if a correct JSON syntax has been sent (indipendently from the content)
						self.log('warn', 'Unespected response');    // Rise a warning in the log but keep going on
					}
				} else {
					self.initConnection(); // Something went wrong, check againg the instance connection
				}
			}
		}, extraHeaders);
	}

	destroy() {
		var self = this;

		// Clear polling timers
		if (self.timers.pollSources) {
			clearInterval(self.timers.pollSources);
			self.timers.pollSources = null;
		}
		if (self.timers.pollConfiguration) {
			clearInterval(self.timers.pollConfiguration);
			self.timers.pollConfiguration = null;
		}
		if (self.timers.pollRecording) {
			clearInterval(self.timers.pollRecording);
			self.timers.pollRecording = null;
		}

		// Clear reconnection timeout
		if(self.timers.reconnectTimeout) {
			clearTimeout(self.timers.reconnectTimeout);
			self.timers.reconnectTimeout = null;
		}

		self.active = false;
	}

	init() {
		var self = this;
		debug = self.debug;
		log = self.log;

		// Keep track of authorization data
		self.auth = {
			passwordMandatory   : null,        // true if password is required by NDI Studio Monitor
			wwwAuthenticate     : null,        // Store wwwAuthenticate headers
			userpass            : null,        // Store web user:password for digest authentication
			NC                  : 0            // Nonce for digest authentication
		}

		// keep track of data found during polling
		self.pollResults = {
			ndiSources: [],            // List of sources available in NDI Studio Monitor
			activeSource: {
				host    : null,        // Active "main" source hostname
				name    : null,        // Active "main" source name
				complete: null        // Active "main" source hostname and name
			},
			activeOverlay: {
				host    : null,        // Active overlay source hostname
				name    : null,        // Active overlay source name
				complete: null        // Active overlay source hostname and name
			},
			overlayModePiP  : null,        // Overlay in PiP mode (true) or alpha mode (false)
			recording       : null,        // true if recording
			audioMute       : null        // true if audio is muted
		}

		self.waitingForResponse = false;    // Flag to keep track if we are waiting for a response to fire a callback inside connect() function
		self.active             = false;    // Flag to keep track if instance is active or not (and ignore some callback processing if inactive)

		// Keep track of setInterval and setTimeout
		self.timers = {
			pollSources         : null,        // ID of setInterval for source polling
			pollConfiguration   : null,        // ID of setInterval for configuration polling
			pollRecording       : null,        // ID of setInterval for recording polling
			reconnectTimeout    : null        // ID of setTimeout for reconnection
		}

		// Store feedback colors in one place to be retrieved later for dynamic preset creation
		self.feedbackColors = {
			active_source: {
				fg: self.rgb(255, 255, 255),
				bg: self.rgb(255, 0, 0)
			},
			active_overlay: {
				fg: self.rgb(0, 0, 0),
				bg: self.rgb(255, 255, 0)
			},
			recording: {
				fg: self.rgb(255, 255, 255),
				bg: self.rgb(255, 0, 0)
			},
			audio_mute: {
				fg: self.rgb(255, 255, 255),
				bg: self.rgb(255, 0, 0)
			}
		};

		// Store default button colors in one place to be retrieved later for dynamic preset creation
		self.defaultColors = {
			fg: self.rgb(255, 255, 255),
			bg: self.rgb(0, 0, 0)
		};

		self.actions();
		self.initVariables();
		self.initFeedbacks();
		self.initPresets();
		self.active = true;
		self.checkConfig();
	}

	updateConfig(config) {
		var self = this;
		self.config = config;
		self.actions();
		self.initVariables();
		self.initFeedbacks();
		self.initPresets();
		self.checkConfig();
	}

	initVariables() {
		var self = this;
		var variables = [
			{ name: 'activeSourceComplete',     label: 'Active source complete name' },
			{ name: 'activeSourceHost',         label: 'Active source hostname' },
			{ name: 'activeSourceName',         label: 'Active source name' },

			{ name: 'activeOverlayComplete',    label: 'Active overlay complete name' },
			{ name: 'activeOverlayHost',        label: 'Active overlay hostname' },
			{ name: 'activeOverlayName',        label: 'Active overlay name' },

			{ name: 'recording',                label: 'Recording active' },
			{ name: 'recordingTimeS',           label: 'Recording time in seconds' },
			{ name: 'recordingTimeMS',          label: 'Recording time in minutes:seconds' }
		]
		self.setVariableDefinitions(variables)
	}

	initFeedbacks() {
		var self = this;
		self.setFeedbackDefinitions(self.getFeedbacks());
	}

	initPresets(updates) {
		var self = this;
		self.setPresetDefinitions(self.getPresets());
	}

	/**
	 * getDigestAuthHeader is derived from digestAuthHeader in package digest-header by fengmk2 (MIT Licensed)
	 * to allow for realm="" (empty realm string) which NDI Studio Monitor is returning
	 */
	getDigestAuthHeader(method, uri, wwwAuthenticate, userpass) {
		var self = this;
		var AUTH_KEY_VALUE_RE = /(\w+)=["']?([^'"]*)["']?/;
		var NC_PAD = '00000000';
		var parts = wwwAuthenticate.split(',');
		var opts = {};
		for (var i = 0; i < parts.length; i++) {
			var m = parts[i].match(AUTH_KEY_VALUE_RE);
			if (m) {
				opts[m[1]] = m[2].replace(/["']/g, '');
			}
		}

		if (opts.realm === undefined || opts.nonce === undefined || opts.nonce == '') {
			return '';
		}

		var qop = opts.qop || '';

		userpass = userpass.split(':');

		var nc = String(++self.auth.NC);
		nc = NC_PAD.substring(nc.length) + nc;
		var cnonce = crypto.randomBytes(8).toString('hex');

		var ha1 = utility.md5(userpass[0] + ':' + opts.realm + ':' + userpass[1]);
		var ha2 = utility.md5(method.toUpperCase() + ':' + uri);
		var s = ha1 + ':' + opts.nonce;
		if (qop) {
			qop = qop.split(',')[0];
			s += ':' + nc + ':' + cnonce + ':' + qop;
		}
		s += ':' + ha2;
		var response = utility.md5(s);
		var authstring = 'Digest username="' + userpass[0] + '", realm="' + opts.realm + '", nonce="' + opts.nonce + '", uri="' + uri + '", response="' + response + '"';
		if (opts.opaque) {
			authstring += ', opaque="' + opts.opaque + '"';
		}
		if (qop) {
			authstring += ', qop="' + qop + '", nc="' + nc + '", cnonce="' + cnonce + '"';
		}
		return authstring;
	}
}

function str_pad_left(string, pad, length) {
	return (new Array(length + 1).join(pad) + string).slice(-length);
}

// Prevent "cannot read property of undefined" in case of unespected object structure
function getSafe(fn) {
	try {
		return fn();
	} catch(e) {
		return undefined;
	}
}

// Get the hostname from a "hostname (source name)" formatted string
function getHost(completeName) {
	let res = completeName.substring(0, completeName.indexOf('(')-1);
	return res;
}

// Get the source name from a "hostname (source name)" formatted string
function getName(completeName) {
	let res = completeName.substring(completeName.indexOf('(')+1, completeName.length-1);
	return res;
}

// Check if the text is a response from the web server of NDI Studio Monitor
// NOTE:    there is no failproof way, if the connection is ok we get an HTML response.
//          We are looking for a match in the title but this is obviously subject to changes.
//          The returned boolean should be used with care
function isNDIStudioMonitorResponse(response) {
	return(response.indexOf('<title>NDI Studio Monitor</title>') != -1);
}

exports = module.exports = instance;
