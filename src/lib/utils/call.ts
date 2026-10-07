import type { Model } from '$lib/stores';

export type CallModelResolution = {
	/** Model id that Call mode should use; null when nothing can be resolved. */
	id: string | null;
	/** Where the id came from. */
	source: 'model' | 'default' | 'chat' | 'none';
	/** A configured preset that is not available to this user (fallback was applied). */
	missing?: string;
};

/**
 * Resolve the model that Call mode should talk to when it is opened from a chat
 * whose primary model is `chatModelId`. Everything is configured in Settings → Audio:
 *
 *   1. per-model entry   `settings.audio.call.models[chatModelId]`
 *      ('' means "no preset": the chat model itself, ignoring the default)
 *   2. default preset    `settings.audio.call.modelId`
 *   3. the chat model itself
 *
 * A configured preset is only used when it exists in `models` (i.e. the user can access it);
 * otherwise the next level is tried and `missing` reports the skipped id.
 */
export const resolveCallModelId = (
	chatModelId: string | null | undefined,
	models: Model[],
	settings: Record<string, any> | null | undefined
): CallModelResolution => {
	const exists = (id: unknown): id is string =>
		typeof id === 'string' && id !== '' && models.some((m) => m.id === id);

	let missing: string | undefined;

	const perModel = chatModelId ? settings?.audio?.call?.models?.[chatModelId] : undefined;
	if (typeof perModel === 'string') {
		if (perModel === '') {
			return { id: chatModelId ?? null, source: 'model' };
		}
		if (exists(perModel)) {
			return { id: perModel, source: 'model' };
		}
		missing = perModel;
	}

	const userDefault = settings?.audio?.call?.modelId;
	if (typeof userDefault === 'string' && userDefault !== '') {
		if (exists(userDefault)) {
			return { id: userDefault, source: 'default', missing };
		}
		missing = missing ?? userDefault;
	}

	if (exists(chatModelId)) {
		return { id: chatModelId, source: 'chat', missing };
	}

	return { id: chatModelId ?? null, source: 'none', missing };
};
