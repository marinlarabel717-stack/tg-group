const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

function patchFile(relativePath, transforms) {
  const fullPath = path.join(root, relativePath)
  let content = fs.readFileSync(fullPath, 'utf8')
  const original = content

  for (const transform of transforms) {
    if (transform.skipIf && transform.skipIf.test(content)) {
      continue
    }
    if (!content.includes(transform.find)) {
      throw new Error(`Patch target not found in ${relativePath}: ${transform.label}`)
    }
    content = content.replace(transform.find, transform.replace)
  }

  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf8')
    console.log(`patched ${relativePath}`)
  } else {
    console.log(`ok ${relativePath}`)
  }
}

patchFile('node_modules/telegram/tl/apiTl.js', [
  {
    label: 'message schema repeat period',
    skipIf: /schedule_repeat_period:flags2\.10\?int/,
    find: 'message#96fdbbe9 flags:# out:flags.1?true mentioned:flags.4?true media_unread:flags.5?true silent:flags.13?true post:flags.14?true from_scheduled:flags.18?true legacy:flags.19?true edit_hide:flags.21?true pinned:flags.24?true noforwards:flags.26?true invert_media:flags.27?true flags2:# offline:flags2.1?true video_processing_pending:flags2.4?true id:int from_id:flags.8?Peer from_boosts_applied:flags.29?int peer_id:Peer saved_peer_id:flags.28?Peer fwd_from:flags.2?MessageFwdHeader via_bot_id:flags.11?long via_business_bot_id:flags2.0?long reply_to:flags.3?MessageReplyHeader date:int message:string media:flags.9?MessageMedia reply_markup:flags.6?ReplyMarkup entities:flags.7?Vector<MessageEntity> views:flags.10?int forwards:flags.10?int replies:flags.23?MessageReplies edit_date:flags.15?int post_author:flags.16?string grouped_id:flags.17?long reactions:flags.20?MessageReactions restriction_reason:flags.22?Vector<RestrictionReason> ttl_period:flags.25?int quick_reply_shortcut_id:flags.30?int effect:flags2.2?long factcheck:flags2.3?FactCheck report_delivery_until_date:flags2.5?int = Message;',
    replace: 'message#96fdbbe9 flags:# out:flags.1?true mentioned:flags.4?true media_unread:flags.5?true silent:flags.13?true post:flags.14?true from_scheduled:flags.18?true legacy:flags.19?true edit_hide:flags.21?true pinned:flags.24?true noforwards:flags.26?true invert_media:flags.27?true flags2:# offline:flags2.1?true video_processing_pending:flags2.4?true id:int from_id:flags.8?Peer from_boosts_applied:flags.29?int peer_id:Peer saved_peer_id:flags.28?Peer fwd_from:flags.2?MessageFwdHeader via_bot_id:flags.11?long via_business_bot_id:flags2.0?long reply_to:flags.3?MessageReplyHeader date:int message:string media:flags.9?MessageMedia reply_markup:flags.6?ReplyMarkup entities:flags.7?Vector<MessageEntity> views:flags.10?int forwards:flags.10?int replies:flags.23?MessageReplies edit_date:flags.15?int post_author:flags.16?string grouped_id:flags.17?long reactions:flags.20?MessageReactions restriction_reason:flags.22?Vector<RestrictionReason> ttl_period:flags.25?int quick_reply_shortcut_id:flags.30?int effect:flags2.2?long factcheck:flags2.3?FactCheck report_delivery_until_date:flags2.5?int schedule_repeat_period:flags2.10?int = Message;'
  },
  {
    label: 'messages.sendMessage schema',
    skipIf: /schedule_repeat_period:flags\.24\?int/,
    find: 'messages.sendMessage#983f9745 flags:# no_webpage:flags.1?true silent:flags.5?true background:flags.6?true clear_draft:flags.7?true noforwards:flags.14?true update_stickersets_order:flags.15?true invert_media:flags.16?true allow_paid_floodskip:flags.19?true peer:InputPeer reply_to:flags.0?InputReplyTo message:string random_id:long reply_markup:flags.2?ReplyMarkup entities:flags.3?Vector<MessageEntity> schedule_date:flags.10?int send_as:flags.13?InputPeer quick_reply_shortcut:flags.17?InputQuickReplyShortcut effect:flags.18?long = Updates;',
    replace: 'messages.sendMessage#545cd15a flags:# no_webpage:flags.1?true silent:flags.5?true background:flags.6?true clear_draft:flags.7?true noforwards:flags.14?true update_stickersets_order:flags.15?true invert_media:flags.16?true allow_paid_floodskip:flags.19?true peer:InputPeer reply_to:flags.0?InputReplyTo message:string random_id:long reply_markup:flags.2?ReplyMarkup entities:flags.3?Vector<MessageEntity> schedule_date:flags.10?int schedule_repeat_period:flags.24?int send_as:flags.13?InputPeer quick_reply_shortcut:flags.17?InputQuickReplyShortcut effect:flags.18?long allow_paid_stars:flags.21?long suggested_post:flags.22?SuggestedPost = Updates;'
  },
  {
    label: 'messages.sendMedia schema',
    skipIf: /messages\.sendMedia#330e77f[\s\S]*schedule_repeat_period:flags\.24\?int/,
    find: 'messages.sendMedia#7852834e flags:# silent:flags.5?true background:flags.6?true clear_draft:flags.7?true noforwards:flags.14?true update_stickersets_order:flags.15?true invert_media:flags.16?true allow_paid_floodskip:flags.19?true peer:InputPeer reply_to:flags.0?InputReplyTo media:InputMedia message:string random_id:long reply_markup:flags.2?ReplyMarkup entities:flags.3?Vector<MessageEntity> schedule_date:flags.10?int send_as:flags.13?InputPeer quick_reply_shortcut:flags.17?InputQuickReplyShortcut effect:flags.18?long = Updates;',
    replace: 'messages.sendMedia#330e77f flags:# silent:flags.5?true background:flags.6?true clear_draft:flags.7?true noforwards:flags.14?true update_stickersets_order:flags.15?true invert_media:flags.16?true allow_paid_floodskip:flags.19?true peer:InputPeer reply_to:flags.0?InputReplyTo media:InputMedia message:string random_id:long reply_markup:flags.2?ReplyMarkup entities:flags.3?Vector<MessageEntity> schedule_date:flags.10?int schedule_repeat_period:flags.24?int send_as:flags.13?InputPeer quick_reply_shortcut:flags.17?InputQuickReplyShortcut effect:flags.18?long allow_paid_stars:flags.21?long suggested_post:flags.22?SuggestedPost = Updates;'
  }
])

patchFile('node_modules/telegram/client/messages.js', [
  {
    label: 'messages.js signature',
    skipIf: /scheduleRepeatPeriod/,
    find: '{ message, replyTo, attributes, parseMode, formattingEntities, linkPreview = true, file, thumb, forceDocument, clearDraft, buttons, silent, supportStreaming, schedule, noforwards, commentTo, topMsgId, } = {}) {',
    replace: '{ message, replyTo, attributes, parseMode, formattingEntities, linkPreview = true, file, thumb, forceDocument, clearDraft, buttons, silent, supportStreaming, schedule, scheduleRepeatPeriod, noforwards, commentTo, topMsgId, } = {}) {'
  },
  {
    label: 'messages.js file pass-through',
    skipIf: /scheduleRepeatPeriod: scheduleRepeatPeriod,\n\s*buttons: buttons/,
    find: '            scheduleDate: schedule,\n            buttons: buttons,',
    replace: '            scheduleDate: schedule,\n            scheduleRepeatPeriod: scheduleRepeatPeriod,\n            buttons: buttons,'
  },
  {
    label: 'messages.js resend file pass-through',
    skipIf: /scheduleRepeatPeriod: scheduleRepeatPeriod,\n\s*}\);/,
    find: '                scheduleDate: schedule,\n            });',
    replace: '                scheduleDate: schedule,\n                scheduleRepeatPeriod: scheduleRepeatPeriod,\n            });'
  },
  {
    label: 'messages.js request pass-through 1',
    skipIf: /scheduleRepeatPeriod: scheduleRepeatPeriod,\n\s*noforwards: noforwards,/,
    find: '            scheduleDate: schedule,\n            noforwards: noforwards,',
    replace: '            scheduleDate: schedule,\n            scheduleRepeatPeriod: scheduleRepeatPeriod,\n            noforwards: noforwards,'
  }
])

patchFile('node_modules/telegram/client/uploads.js', [
  {
    label: 'uploads.js signature',
    skipIf: /scheduleRepeatPeriod/,
    find: 'async function sendFile(client, entity, { file, caption, forceDocument = false, fileSize, clearDraft = false, progressCallback, replyTo, attributes, thumb, parseMode, formattingEntities, voiceNote = false, videoNote = false, buttons, silent, supportsStreaming = false, scheduleDate, workers = 1, noforwards, commentTo, topMsgId, }) {',
    replace: 'async function sendFile(client, entity, { file, caption, forceDocument = false, fileSize, clearDraft = false, progressCallback, replyTo, attributes, thumb, parseMode, formattingEntities, voiceNote = false, videoNote = false, buttons, silent, supportsStreaming = false, scheduleDate, scheduleRepeatPeriod, workers = 1, noforwards, commentTo, topMsgId, }) {'
  },
  {
    label: 'uploads.js album pass-through',
    skipIf: /scheduleRepeatPeriod: scheduleRepeatPeriod,\n\s*supportsStreaming: supportsStreaming/,
    find: '            scheduleDate: scheduleDate,\n            supportsStreaming: supportsStreaming,',
    replace: '            scheduleDate: scheduleDate,\n            scheduleRepeatPeriod: scheduleRepeatPeriod,\n            supportsStreaming: supportsStreaming,'
  },
  {
    label: 'uploads.js request pass-through',
    skipIf: /scheduleRepeatPeriod: scheduleRepeatPeriod,\n\s*clearDraft: clearDraft/,
    find: '        scheduleDate: scheduleDate,\n        clearDraft: clearDraft,',
    replace: '        scheduleDate: scheduleDate,\n        scheduleRepeatPeriod: scheduleRepeatPeriod,\n        clearDraft: clearDraft,'
  }
])
