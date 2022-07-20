module.exports = {
	getFeedbacks() {
		var feedbacks = {};

		feedbacks['active_source'] = {
			label: 'Source is selected',
			description: 'When source is selected in NDI Studio Monitor, background color will change',
			options: [
				{
					type    : 'dropdown',
					label   : 'Video source',
					id      : 'source',
					allowCustom: true,
					choices : this.pollResults.ndiSources,
					default : ''

				},
				{
					type    : 'colorpicker',
					label   : 'Foreground color',
					id      : 'fg',
					default : this.feedbackColors.active_source.fg

				},
				{
					type    : 'colorpicker',
					label   : 'Background color',
					id      : 'bg',
					default : this.feedbackColors.active_source.bg
				}
			],
			callback: (feedback, bank) => {
				if (this.pollResults.activeSource.complete === feedback.options.source) {
					return {
						color   : feedback.options.fg,
						bgcolor : feedback.options.bg
					};
				}
			}
		};


		feedbacks['active_overlay'] = {
			label: 'Source is in overlay (PiP or alpha)',
			description: 'When source is selected as overlay in NDI Studio Monitor, background color will change',
			options: [
				{
					type    : 'dropdown',
					label   : 'Video source',
					id      : 'source',
					allowCustom: true,
					choices : this.pollResults.ndiSources,
					default : ''

				},
				{
					type    : 'colorpicker',
					label   : 'Foreground color',
					id      : 'fg',
					default : this.feedbackColors.active_overlay.fg

				},
				{
					type    : 'colorpicker',
					label   : 'Background color',
					id      : 'bg',
					default : this.feedbackColors.active_overlay.bg
				}
			],
			callback: (feedback, bank) => {
				if(this.pollResults.activeOverlay.complete === feedback.options.source) {
					return {
						color   : feedback.options.fg,
						bgcolor : feedback.options.bg
					};
				}
			}
		};

		feedbacks['active_overlay_pip'] = {
			label: 'Source is in PiP overlay',
			description: 'When source is selected as PiP overlay in NDI Studio Monitor, background color will change',
			options: [
				{
					type    : 'dropdown',
					label   : 'Video source',
					id      : 'source',
					allowCustom: true,
					choices : this.pollResults.ndiSources,
					default : ''

				},
				{
					type    : 'colorpicker',
					label   : 'Foreground color',
					id      : 'fg',
					default : this.feedbackColors.active_overlay.fg

				},
				{
					type    : 'colorpicker',
					label   : 'Background color',
					id      : 'bg',
					default : this.feedbackColors.active_overlay.bg
				}
			],
			callback: (feedback, bank) => {
				if (this.pollResults.activeOverlay.complete === feedback.options.source && this.pollResults.overlayModePiP === true) {
					return {
						color   : feedback.options.fg,
						bgcolor : feedback.options.bg
					};
				}
			}
		};

		feedbacks['active_overlay_alpha'] = {
			label: 'Source is in alpha overlay',
			description: 'When source is selected as alpha overlay in NDI Studio Monitor, background color will change',
			options: [
				{
					type    : 'dropdown',
					label   : 'Video source',
					id      : 'source',
					allowCustom: true,
					choices : this.pollResults.ndiSources,
					default : ''

				},
				{
					type    : 'colorpicker',
					label   : 'Foreground color',
					id      : 'fg',
					default : this.feedbackColors.active_overlay.fg

				},
				{
					type    : 'colorpicker',
					label   : 'Background color',
					id      : 'bg',
					default : this.feedbackColors.active_overlay.bg
				}
			],
			callback: (feedback, bank) => {
				if (this.pollResults.activeOverlay.complete === feedback.options.source && this.pollResults.overlayModePiP === false) {
					return {
						color   : feedback.options.fg,
						bgcolor : feedback.options.bg
					};
				}
			}
		};

		feedbacks['recording'] = {
			label: 'Recording is active',
			description: 'When recording is active in NDI Studio Monitor, background color will change',
			options: [
				{
					type    : 'colorpicker',
					label   : 'Foreground color',
					id      : 'fg',
					default : this.feedbackColors.recording.fg

				},
				{
					type    : 'colorpicker',
					label   : 'Background color',
					id      : 'bg',
					default : this.feedbackColors.recording.bg
				}
			],
			callback: (feedback, bank) => {
				if (this.pollResults.recording === true) {
					return {
						color   : feedback.options.fg,
						bgcolor : feedback.options.bg
					};
				}
			}
		};

		feedbacks['audio_mute'] = {
			label: 'Audio is muted',
			description: 'Background color will change when audio is muted',
			options: [
				{
					type    : 'colorpicker',
					label   : 'Foreground color',
					id      : 'fg',
					default : this.feedbackColors.audio_mute.bg

				},
				{
					type    : 'colorpicker',
					label   : 'Background color',
					id      : 'bg',
					default : this.feedbackColors.audio_mute.bg
				}
			],
			callback: (feedback, bank) => {
				if (this.pollResults.audioMute === true) {
					return {
						color   : feedback.options.fg,
						bgcolor : feedback.options.bg
					};
				}
			}
		};

		return feedbacks;
	}
}
