<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { createEventDispatcher, onMount, getContext } from 'svelte';

	import { user, settings, config, models, type Model } from '$lib/stores';
	import { getVoices as _getVoices } from '$lib/apis/audio';

	import Switch from '$lib/components/common/Switch.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import UserSettingField from './UserSettingField.svelte';
	import UserSettingRow from './UserSettingRow.svelte';
	import SettingsSelect from '$lib/components/common/SettingsSelect.svelte';
	import XMark from '$lib/components/icons/XMark.svelte';
	import UserSettingSection from './UserSettingSection.svelte';
	const dispatch = createEventDispatcher();

	const i18n = getContext('i18n');

	export let saveSettings: Function;

	// Audio
	let conversationMode = false;
	let speechAutoSend = false;
	let responseAutoPlayback = false;
	let nonLocalVoices = false;

	let STTEngine = '';
	let STTLanguage = '';

	let TTSEngine = '';
	let TTSEngineConfig = {};

	let TTSModel = null;
	let TTSModelProgress = null;
	let TTSModelLoading = false;

	let voices = [];
	let voice = '';

	// Audio speed control
	let playbackRate = 1;

	// Call mode: default model (preset) used when a call is opened
	let callModelId = '';
	// Per-chat-model overrides: [{ model: chat model id, preset: call model id or '' = no preset }]
	let callModelMap: { model: string; preset: string }[] = [];

	// Only custom (workspace) presets are offered: base models from connections are text-oriented.
	// A previously saved base model stays listed so the current choice is still visible.
	const callPresetOptions = (models: Model[], current: string) =>
		models.filter((m) => !!m?.info?.base_model_id || (current !== '' && m.id === current));

	// The chat-model column lists base models only; presets are what the row maps to, not from.
	const callChatModelOptions = (models: Model[], current: string) =>
		models.filter((m) => !m?.info?.base_model_id || (current !== '' && m.id === current));

	const addCallModelEntry = () => {
		callModelMap = [...callModelMap, { model: '', preset: '' }];
	};

	const removeCallModelEntry = (idx: number) => {
		callModelMap = callModelMap.filter((_, i) => i !== idx);
	};
	const inputClass =
		'h-7 w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2 text-xs text-gray-700 outline-hidden transition-colors placeholder:text-gray-300 focus:border-blue-400 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-300 dark:placeholder:text-gray-700 dark:focus:border-blue-500';

	const getVoices = async () => {
		if (TTSEngine === 'browser-kokoro') {
			if (!TTSModel) {
				await loadKokoro();
			}

			voices = Object.entries(TTSModel.voices).map(([key, value]) => {
				return {
					id: key,
					name: value.name,
					localService: false
				};
			});
		} else {
			if ($config.audio.tts.engine === '') {
				const getVoicesLoop = setInterval(async () => {
					voices = await speechSynthesis.getVoices();

					// do your loop
					if (voices.length > 0) {
						clearInterval(getVoicesLoop);
					}
				}, 100);
			} else {
				const res = await _getVoices(localStorage.token).catch((e) => {
					toast.error(`${e}`);
				});

				if (res) {
					console.log(res);
					voices = res.voices;
				}
			}
		}
	};

	const setResponseAutoPlayback = async (enabled: boolean) => {
		responseAutoPlayback = enabled;
		saveSettings({ responseAutoPlayback: responseAutoPlayback });
	};

	const setSpeechAutoSend = async (enabled: boolean) => {
		speechAutoSend = enabled;
		saveSettings({ speechAutoSend: speechAutoSend });
	};

	onMount(async () => {
		playbackRate = $settings.audio?.tts?.playbackRate ?? 1;
		conversationMode = $settings.conversationMode ?? false;
		speechAutoSend = $settings.speechAutoSend ?? false;
		responseAutoPlayback = $settings.responseAutoPlayback ?? false;

		STTEngine = $settings?.audio?.stt?.engine ?? '';
		STTLanguage = $settings?.audio?.stt?.language ?? '';

		TTSEngine = $settings?.audio?.tts?.engine ?? '';
		TTSEngineConfig = $settings?.audio?.tts?.engineConfig ?? {};

		if ($settings?.audio?.tts?.defaultVoice === $config.audio.tts.voice) {
			voice = $settings?.audio?.tts?.voice ?? $config.audio.tts.voice ?? '';
		} else {
			voice = $config.audio.tts.voice ?? '';
		}

		nonLocalVoices = $settings.audio?.tts?.nonLocalVoices ?? false;
		callModelId = $settings?.audio?.call?.modelId ?? '';
		callModelMap = Object.entries($settings?.audio?.call?.models ?? {}).map(([model, preset]) => ({
			model,
			preset: typeof preset === 'string' ? preset : ''
		}));

		await getVoices();
	});

	$: if (TTSEngine && TTSEngineConfig) {
		onTTSEngineChange();
	}

	const onTTSEngineChange = async () => {
		if (TTSEngine === 'browser-kokoro') {
			await loadKokoro();
		}
	};

	const loadKokoro = async () => {
		if (TTSEngine === 'browser-kokoro') {
			voices = [];

			if (TTSEngineConfig?.dtype) {
				TTSModel = null;
				TTSModelProgress = null;
				TTSModelLoading = true;

				const model_id = 'onnx-community/Kokoro-82M-v1.0-ONNX';

				const { KokoroTTS } = await import('kokoro-js');
				TTSModel = await KokoroTTS.from_pretrained(model_id, {
					dtype: TTSEngineConfig.dtype, // Options: "fp32", "fp16", "q8", "q4", "q4f16"
					device: !!navigator?.gpu ? 'webgpu' : 'wasm', // Detect WebGPU
					progress_callback: (e) => {
						TTSModelProgress = e;
						console.log(e);
					}
				});

				await getVoices();

				// const rawAudio = await tts.generate(inputText, {
				// 	// Use `tts.list_voices()` to list all available voices
				// 	voice: voice
				// });

				// const blobUrl = URL.createObjectURL(await rawAudio.toBlob());
				// const audio = new Audio(blobUrl);

				// audio.play();
			}
		}
	};
</script>

<form
	id="tab-audio"
	class="flex flex-col h-full justify-between text-sm"
	on:submit|preventDefault={async () => {
		saveSettings({
			audio: {
				stt: {
					engine: STTEngine !== '' ? STTEngine : undefined,
					language: STTLanguage !== '' ? STTLanguage : undefined
				},
				tts: {
					engine: TTSEngine !== '' ? TTSEngine : undefined,
					engineConfig: TTSEngineConfig,
					playbackRate: playbackRate,
					voice: voice !== '' ? voice : undefined,
					defaultVoice: $config?.audio?.tts?.voice ?? '',
					nonLocalVoices: $config.audio.tts.engine === '' ? nonLocalVoices : undefined
				},
				call: {
					modelId: callModelId !== '' ? callModelId : undefined,
					models:
						callModelMap.filter((e) => e.model !== '').length > 0
							? Object.fromEntries(
									callModelMap.filter((e) => e.model !== '').map((e) => [e.model, e.preset])
								)
							: undefined
				}
			}
		});
		dispatch('save');
	}}
>
	<h2 class="text-sm font-medium text-gray-900 dark:text-white mb-4">
		{$i18n.t('settings.personal.audio.title')}
	</h2>

	<div class="flex-1 min-h-0 overflow-y-auto scrollbar-hover pr-1.5">
		<UserSettingSection title={$i18n.t('settings.personal.audio.sections.sttSettings.title')} first>
			{#if $config.audio.stt.engine !== 'web'}
				<UserSettingRow
					label={$i18n.t('settings.personal.audio.speechToTextEngine.label')}
					description={$i18n.t('settings.personal.audio.speechToTextEngine.description')}
				>
					<SettingsSelect
						bind:value={STTEngine}
						ariaLabel={$i18n.t('settings.personal.audio.speechToTextEngine.label')}
						placeholder={$i18n.t('Select an engine')}
					>
						<option value="">{$i18n.t('Default')}</option>
						<option value="web">{$i18n.t('Web API')}</option>
					</SettingsSelect>
				</UserSettingRow>

				<UserSettingRow
					label={$i18n.t('settings.personal.audio.language.label')}
					description={$i18n.t('settings.personal.audio.language.description')}
				>
					<Tooltip
						content={$i18n.t(
							'The language of the input audio. Supplying the input language in ISO-639-1 (e.g. en) format will improve accuracy and latency. Leave blank to automatically detect the language.'
						)}
						placement="top"
					>
						<input
							type="text"
							bind:value={STTLanguage}
							aria-label={$i18n.t('Speech-to-Text Language')}
							placeholder={$i18n.t('e.g. en')}
							class="h-7 w-24 rounded-lg border border-gray-100/50 bg-gray-50/40 px-2 text-right text-xs text-gray-700 outline-hidden transition-colors placeholder:text-gray-300 focus:border-blue-400 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-300 dark:placeholder:text-gray-700 dark:focus:border-blue-500"
						/>
					</Tooltip>
				</UserSettingRow>
			{/if}

			<UserSettingRow
				label={$i18n.t('settings.personal.audio.instantAutoSendAfterVoiceTranscription.label')}
				description={$i18n.t(
					'settings.personal.audio.instantAutoSendAfterVoiceTranscription.description'
				)}
			>
				<Switch
					state={speechAutoSend}
					ariaLabel={$i18n.t(
						'settings.personal.audio.instantAutoSendAfterVoiceTranscription.label'
					)}
					on:change={(event) => {
						setSpeechAutoSend(event.detail);
					}}
				/>
			</UserSettingRow>
		</UserSettingSection>

		<UserSettingSection title={$i18n.t('settings.personal.audio.sections.ttsSettings.title')}>
			<UserSettingRow
				label={$i18n.t('settings.personal.audio.textToSpeechEngine.label')}
				description={$i18n.t('settings.personal.audio.textToSpeechEngine.description')}
			>
				<SettingsSelect
					bind:value={TTSEngine}
					ariaLabel={$i18n.t('settings.personal.audio.textToSpeechEngine.label')}
					placeholder={$i18n.t('Select an engine')}
				>
					<option value="">{$i18n.t('Default')}</option>
					<option value="browser-kokoro">{$i18n.t('Kokoro.js (Browser)')}</option>
				</SettingsSelect>
			</UserSettingRow>

			{#if TTSEngine === 'browser-kokoro'}
				<UserSettingRow
					label={$i18n.t('settings.personal.audio.kokoroJsDtype.label')}
					description={$i18n.t('settings.personal.audio.kokoroJsDtype.description')}
				>
					<SettingsSelect
						bind:value={TTSEngineConfig.dtype}
						ariaLabel={$i18n.t('settings.personal.audio.kokoroJsDtype.label')}
						placeholder={$i18n.t('Select dtype')}
					>
						<option value="" disabled selected>{$i18n.t('Select dtype')}</option>
						<option value="fp32">fp32</option>
						<option value="fp16">fp16</option>
						<option value="q8">q8</option>
						<option value="q4">q4</option>
					</SettingsSelect>
				</UserSettingRow>
			{/if}

			<UserSettingRow
				label={$i18n.t('settings.personal.audio.autoPlaybackResponse.label')}
				description={$i18n.t('settings.personal.audio.autoPlaybackResponse.description')}
			>
				<Switch
					state={responseAutoPlayback}
					ariaLabel={$i18n.t('settings.personal.audio.autoPlaybackResponse.label')}
					on:change={(event) => {
						setResponseAutoPlayback(event.detail);
					}}
				/>
			</UserSettingRow>

			<UserSettingRow
				label={$i18n.t('settings.personal.audio.speechPlaybackSpeed.label')}
				description={$i18n.t('settings.personal.audio.speechPlaybackSpeed.description')}
			>
				<div class="relative flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-600">
					<input
						type="number"
						min="0"
						step="0.01"
						bind:value={playbackRate}
						aria-label={$i18n.t('settings.personal.audio.speechPlaybackSpeed.label')}
						class="h-7 w-16 rounded-lg border border-gray-100/50 bg-gray-50/40 px-2 text-right text-xs text-gray-700 outline-hidden transition-colors focus:border-blue-400 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-300 dark:focus:border-blue-500"
					/>
					x
				</div>
			</UserSettingRow>
		</UserSettingSection>

		<UserSettingSection title={$i18n.t('settings.personal.audio.sections.call.title')}>
			<UserSettingRow
				label={$i18n.t('settings.personal.audio.callModel.label')}
				description={$i18n.t('settings.personal.audio.callModel.description')}
			>
				<SettingsSelect
					bind:value={callModelId}
					className="w-full sm:w-auto sm:max-w-[16rem]"
					ariaLabel={$i18n.t('settings.personal.audio.callModel.label')}
					placeholder={$i18n.t('Select a model')}
				>
					<option value="">{$i18n.t('settings.personal.audio.callModel.sameAsChat')}</option>
					{#each callPresetOptions($models, callModelId) as m (m.id)}
						<option value={m.id} class="bg-gray-100 dark:bg-gray-700">{m.name ?? m.id}</option>
					{/each}
				</SettingsSelect>
			</UserSettingRow>

			<UserSettingField
				label={$i18n.t('settings.personal.audio.callModels.label')}
				description={$i18n.t('settings.personal.audio.callModels.description')}
			>
				<div class="flex flex-col gap-1.5">
					{#each callModelMap as entry, idx}
						<div class="flex items-center gap-1.5">
							<SettingsSelect
								bind:value={entry.model}
								className="min-w-0 flex-1"
								ariaLabel={$i18n.t('settings.personal.audio.callModels.chatModel')}
								placeholder={$i18n.t('settings.personal.audio.callModels.chatModel')}
							>
								<option value="">{$i18n.t('Select a model')}</option>
								{#each callChatModelOptions($models, entry.model) as m (m.id)}
									<option value={m.id} class="bg-gray-100 dark:bg-gray-700">{m.name ?? m.id}</option
									>
								{/each}
							</SettingsSelect>
							<span class="shrink-0 text-xs text-gray-400 dark:text-gray-600">→</span>
							<SettingsSelect
								bind:value={entry.preset}
								className="min-w-0 flex-1"
								ariaLabel={$i18n.t('settings.personal.audio.callModels.callModel')}
								placeholder={$i18n.t('settings.personal.audio.callModels.callModel')}
							>
								<option value="">{$i18n.t('settings.personal.audio.callModels.noPreset')}</option>
								{#each callPresetOptions($models, entry.preset) as m (m.id)}
									<option value={m.id} class="bg-gray-100 dark:bg-gray-700">{m.name ?? m.id}</option
									>
								{/each}
							</SettingsSelect>
							<button
								type="button"
								class="shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
								aria-label={$i18n.t('Remove')}
								on:click={() => removeCallModelEntry(idx)}
							>
								<XMark className="size-3.5" strokeWidth="2" />
							</button>
						</div>
					{/each}
					<button
						type="button"
						class="self-start text-xs text-gray-500 transition hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
						on:click={addCallModelEntry}
					>
						+ {$i18n.t('settings.personal.audio.callModels.add')}
					</button>
				</div>
			</UserSettingField>
		</UserSettingSection>

		{#if TTSEngine === 'browser-kokoro'}
			{#if TTSModel}
				<UserSettingSection title={$i18n.t('settings.personal.audio.sections.voice.title')}>
					<UserSettingField
						label={$i18n.t('settings.personal.audio.kokoroVoice.label')}
						description={$i18n.t('settings.personal.audio.kokoroVoice.description')}
					>
						<input
							list="voice-list"
							class={inputClass}
							bind:value={voice}
							aria-label={$i18n.t('settings.personal.audio.sections.voice.title')}
							placeholder={$i18n.t('Select a voice')}
						/>

						<datalist id="voice-list">
							{#each voices as voice}
								<option value={voice.id}>{voice.name}</option>
							{/each}
						</datalist>
					</UserSettingField>
				</UserSettingSection>
			{:else}
				<UserSettingSection title={$i18n.t('settings.personal.audio.sections.voice.title')}>
					<div class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
						<Spinner className="size-4" />

						<div class="shimmer">
							{$i18n.t('Loading Kokoro.js...')}
							{TTSModelProgress && TTSModelProgress.status === 'progress'
								? `(${Math.round(TTSModelProgress.progress * 10) / 10}%)`
								: ''}
						</div>
					</div>

					<div class="text-[0.6875rem] text-gray-400 dark:text-gray-600">
						{$i18n.t('Please do not close the settings page while loading the model.')}
					</div>
				</UserSettingSection>
			{/if}
		{:else if $config.audio.tts.engine === ''}
			<UserSettingSection title={$i18n.t('settings.personal.audio.sections.voice.title')}>
				<UserSettingField
					label={$i18n.t('settings.personal.audio.browserVoice.label')}
					description={$i18n.t('settings.personal.audio.browserVoice.description')}
				>
					<SettingsSelect
						bind:value={voice}
						className="w-full"
						ariaLabel={$i18n.t('settings.personal.audio.sections.voice.title')}
					>
						<option value="" selected={voice !== ''}>{$i18n.t('Default')}</option>
						{#each voices.filter((v) => nonLocalVoices || v.localService === true) as _voice}
							<option
								value={_voice.name}
								class="bg-gray-100 dark:bg-gray-700"
								selected={voice === _voice.name}>{_voice.name}</option
							>
						{/each}
					</SettingsSelect>
				</UserSettingField>
				<UserSettingRow
					label={$i18n.t('settings.personal.audio.allowNonLocalVoices.label')}
					description={$i18n.t('settings.personal.audio.allowNonLocalVoices.description')}
				>
					<Switch bind:state={nonLocalVoices} />
				</UserSettingRow>
			</UserSettingSection>
		{:else if $config.audio.tts.engine !== ''}
			<UserSettingSection title={$i18n.t('settings.personal.audio.sections.voice.title')}>
				<UserSettingField
					label={$i18n.t('settings.personal.audio.serviceVoice.label')}
					description={$i18n.t('settings.personal.audio.serviceVoice.description')}
				>
					<input
						list="voice-list"
						class={inputClass}
						bind:value={voice}
						aria-label={$i18n.t('settings.personal.audio.sections.voice.title')}
						placeholder={$i18n.t('Select a voice')}
					/>

					<datalist id="voice-list">
						{#each voices as voice}
							<option value={voice.id}>{voice.name}</option>
						{/each}
					</datalist>
				</UserSettingField>
			</UserSettingSection>
		{/if}
	</div>

	<div class="shrink-0 flex justify-end text-sm font-normal">
		<button
			class="px-3.5 py-1.5 text-sm font-normal bg-black hover:bg-gray-900 text-white dark:bg-white dark:text-black dark:hover:bg-gray-100 transition rounded-full"
			type="submit"
		>
			{$i18n.t('Save')}
		</button>
	</div>
</form>
