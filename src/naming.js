// Compiles the user's {variable} naming rule into a yt-dlp -o pattern.
//
// Two rules make this different from the reference downloaders:
//   1. Inside one path segment, a separator is bound to the variable in front
//      of it and emitted through yt-dlp's "%(field&TEXT|)s" conditional, so a
//      clip with no uploader yields "标题.mp4", not "NA-标题.mp4".
//   2. Directory segments instead get a literal fallback. A "/" placed inside a
//      conditional would be sanitised into the look-alike "⧸" and stop creating
//      a real folder, so path separators always stay outside field templates.
'use strict';
const { t } = require('./i18n');

const DEFAULT_TEMPLATE = '{platform}/{user_name}-{content}';

// `presence: null` marks a field yt-dlp always fills in.
const TEMPLATE_FIELDS = {
  platform: { value: '%(extractor)s', presence: null, fallback: t('naming.fallback.platform') },
  content: { value: '%(title).120B', presence: null, fallback: t('naming.fallback.content') },
  index: { value: '%(autonumber)s', presence: null, fallback: '0' },
  user_name: { value: '%(uploader,uploader_id,channel,creator|)s', presence: 'uploader,uploader_id,channel,creator', fallback: t('naming.fallback.userName') },
  link_id: { value: '%(id|)s', presence: 'id', fallback: t('naming.fallback.linkId') },
  date_published: { value: '%(upload_date>%Y-%m-%d|)s', presence: 'upload_date', fallback: t('naming.fallback.datePublished') }
};

// Text safe to embed inside a "%(field&TEXT|)s" conditional.
const SAFE_SEPARATOR = /^[^%()|&/]+$/;

function stampFor(now) {
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function fieldTemplate(name, isDirectory) {
  const field = TEMPLATE_FIELDS[name];
  if (!isDirectory || !field.presence) return field.value;
  // A folder must never come out empty, so swap the empty default for a label.
  return field.value.replace(/\|\)s$/, `|${field.fallback})s`);
}

function compileSegment(segment, isDirectory, stamp) {
  let out = '';
  let guard = null;
  for (const part of segment.split(/(\{[a-z_]+\})/)) {
    if (!part) continue;
    const name = part.startsWith('{') && part.endsWith('}') ? part.slice(1, -1) : null;
    if (name === 'current_time') { out += stamp.replace(/%/g, '%%'); guard = null; continue; }
    if (name && TEMPLATE_FIELDS[name]) {
      out += fieldTemplate(name, isDirectory);
      guard = isDirectory ? null : TEMPLATE_FIELDS[name].presence;
      continue;
    }
    out += guard && SAFE_SEPARATOR.test(part) ? `%(${guard}&${part}|)s` : part.replace(/%/g, '%%');
    guard = null;
  }
  return out;
}

function outputTemplate(raw, now = new Date()) {
  const template = String(raw || '').trim() || DEFAULT_TEMPLATE;
  if (/[:*?"<>|]/.test(template.replace(/\{[a-z_]+\}/g, ''))) throw new Error(t('err.templateChars'));
  const normalized = template.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
  if (normalized.split('/').some(part => part === '..')) throw new Error(t('err.templateParent'));
  if (!/\{[a-z_]+\}/.test(normalized)) throw new Error(t('err.templateEmpty'));

  const stamp = stampFor(now);
  const segments = normalized.split('/');
  const compiled = segments.map((segment, index) => compileSegment(segment, index < segments.length - 1, stamp));
  return `${compiled.join('/')}.%(ext)s`;
}

module.exports = { DEFAULT_TEMPLATE, TEMPLATE_FIELDS, outputTemplate };
