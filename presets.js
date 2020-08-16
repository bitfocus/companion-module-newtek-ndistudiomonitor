module.exports = {
	getPresets() {
		let presets = []

		presets.push({
			category: 'Basic actions',
			label   : 'Audio mute',
			bank: {
				style   : 'text',
				text    : 'Audio mute',
				size    : 'auto',
				color   : this.rgb(255, 255, 255),
				bgcolor : this.rgb(0, 100, 0)
			},
			feedbacks: [
				{
					type: 'audio_mute',
					options: {
						fg: this.feedbackColors.audio_mute.fg,
						bg: this.feedbackColors.audio_mute.bg
					}
				}
			],
			actions: [
				{
					action: 'audio_mute'
				}
			]
		});

		presets.push({
			category: 'Basic actions',
			label   : 'Audio unmute',
			bank: {
				style   : 'text',
				text    : 'Audio unmute',
				size    : 'auto',
				color   : this.rgb(255, 255, 255),
				bgcolor : this.rgb(0, 100, 0)
			},
			feedbacks: [
				{
					type: 'audio_mute',
					options: {
						fg: this.feedbackColors.audio_mute.fg,
						bg: this.feedbackColors.audio_mute.bg
					}
				}
			],
			actions: [
				{
					action: 'audio_unmute'
				}
			]
		});

		presets.push({
			category: 'Basic actions',
			label   : 'Overlay hide',
			bank: {
				style   : 'text',
				text    : 'Overlay hide',
				size    : 'auto',
				color   : this.defaultColors.fg,
				bgcolor : this.defaultColors.bg
			},
			actions: [
				{
					action: 'overlay_hide'
				}
			]
		});

		presets.push({
			category: 'Recording',
			label   : 'REC start',
			bank: {
				style   : 'text',
				text    : 'NDI recording start',
				size    : 'auto',
				color   : this.defaultColors.fg,
				bgcolor : this.defaultColors.bg
			},
			feedbacks: [
				{
					type: 'recording',
					options: {
						fg: this.feedbackColors.recording.fg,
						bg: this.feedbackColors.recording.bg
					}
				}
			],
			actions: [
				{
					action: 'rec_start'
				}
			]
		});

		presets.push({
			category: 'Recording',
			label   : 'REC stop',
			bank: {
				style   : 'text',
				text    : 'NDI recording stop',
				size    : 'auto',
				color   : this.defaultColors.fg,
				bgcolor : this.defaultColors.bg
			},
			feedbacks: [
				{
					type: 'recording',
					options: {
						fg: this.feedbackColors.recording.fg,
						bg: this.feedbackColors.recording.bg
					}
				}
			],
			actions: [
				{
					action: 'rec_stop'
				}
			]
		});

		presets.push({
			category: 'Feedbacks',
			label   : 'Recording Time Seconds',
			bank: {
				style   : 'text',
				text    : 'REC TIME $(label:recordingTimeS)',
				size    : '14',
				color   : this.defaultColors.fg,
				bgcolor : this.defaultColors.bg
			},
			feedbacks: [
				{
					type: 'recording',
					options: {
						fg: this.feedbackColors.recording.fg,
						bg: this.feedbackColors.recording.bg
					}
				}
			]
		});

		presets.push({
			category: 'Feedbacks',
			label   : 'Recording Time MM:SS',
			bank: {
				style   : 'text',
				text    : 'REC TIME $(label:recordingTimeMS)',
				size    : '14',
				color   : this.defaultColors.fg,
				bgcolor : this.defaultColors.bg
			},
			feedbacks: [
				{
					type: 'recording',
					options: {
						fg: this.feedbackColors.recording.fg,
						bg: this.feedbackColors.recording.bg
					}
				}
			]
		});

		presets.push({
			category: 'Feedbacks',
			label   : 'Active source complete name',
			bank: {
				style   : 'text',
				text    : 'ACTIVE: $(label:activeSourceComplete)',
				size    : 'auto',
				color   : this.defaultColors.fg,
				bgcolor : this.defaultColors.bg
			}
		});

		presets.push({
			category: 'Feedbacks',
			label   : 'Active source name',
			bank: {
				style   : 'text',
				text    : 'ACTIVE: $(label:activeSourceName)',
				size    : 'auto',
				color   : this.defaultColors.fg,
				bgcolor : this.defaultColors.bg
			}
		});

		presets.push({
			category: 'Feedbacks',
			label   : 'Active overlay complete name',
			bank: {
				style   : 'text',
				text    : 'OVERLAY: $(label:activeOverlayComplete)',
				size    : 'auto',
				color   : this.defaultColors.fg,
				bgcolor : this.defaultColors.bg
			}
		});

		presets.push({
			category: 'Feedbacks',
			label   : 'Active overlay name',
			bank: {
				style   : 'text',
				text    : 'OVERLAY: $(label:activeOverlayName)',
				size    : 'auto',
				color   : this.defaultColors.fg,
				bgcolor : this.defaultColors.bg
			}
		});

		return presets
	}
}