use comrak::{Options, markdown_to_html};

/// URL pattern of the YouTube thumbnail shown on link cards.
pub const YOUTUBE_THUMB_URL: &str = "https://i.ytimg.com/vi/{id}/hqdefault.jpg";

/// `{{video: explain.mp4}}` — recorded video served from the course bundle.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VideoRef {
    /// File name inside the chapter directory, e.g. `explain.mp4`.
    pub file: String,
}

/// `{{youtube: <url> | Title | Channel}}` — external link card with a
/// thumbnail preview.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct YoutubeRef {
    pub url: String,
    pub title: String,
    pub channel: Option<String>,
    /// Video id extracted from the URL, when recognisable.
    pub video_id: Option<String>,
}

impl YoutubeRef {
    pub fn thumbnail_url(&self) -> Option<String> {
        self.video_id
            .as_ref()
            .map(|id| YOUTUBE_THUMB_URL.replace("{id}", id))
    }
}

/// Extracts the video id from common YouTube URL forms.
pub fn youtube_id(url: &str) -> Option<String> {
    let url = url.trim();
    let candidate = |value: &str| -> Option<String> {
        let value = value.split(['?', '#', '&']).next()?;
        let value = value.trim_matches('/');
        if value.len() == 11
            && value
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_".contains(c))
        {
            Some(value.to_owned())
        } else {
            None
        }
    };
    for marker in ["youtu.be/", "watch?v=", "/embed/", "/shorts/", "/live/"] {
        if let Some(pos) = url.find(marker) {
            return candidate(&url[pos + marker.len()..]);
        }
    }
    None
}

/// Rendered lesson: HTML body plus the media extracted from directives.
#[derive(Debug, Default)]
pub struct ParsedLesson {
    pub html: String,
    pub videos: Vec<VideoRef>,
    pub youtube: Vec<YoutubeRef>,
}

/// Directive syntax: `{{ video: file.mp4 }}`, `{{ youtube: URL | Title | Channel }}`.
/// `Channel` is optional.
fn parse_directives(source: &str) -> (String, Vec<VideoRef>, Vec<YoutubeRef>) {
    let mut videos = Vec::new();
    let mut youtube = Vec::new();
    let mut text = String::with_capacity(source.len());
    let mut rest = source;

    while let Some(start) = rest.find("{{") {
        let Some(end_rel) = rest[start + 2..].find("}}") else {
            break;
        };
        let end = start + 2 + end_rel + 2;
        text.push_str(&rest[..start]);
        let directive = rest[start + 2..end - 2].trim();
        let Some((kind, value)) = directive.split_once(':') else {
            // Not a known directive: keep the literal text.
            text.push_str(&rest[start..end]);
            rest = &rest[end..];
            continue;
        };
        let value = value.trim();
        match kind.trim().to_ascii_lowercase().as_str() {
            "video" if !value.is_empty() => {
                videos.push(VideoRef {
                    file: value.to_owned(),
                });
            }
            "youtube" if !value.is_empty() => {
                let mut parts = value.split('|').map(str::trim);
                let url = parts.next().unwrap_or_default().to_owned();
                let title = parts
                    .next()
                    .filter(|t| !t.is_empty())
                    .map(str::to_owned)
                    .unwrap_or_else(|| url.clone());
                let channel = parts.next().filter(|c| !c.is_empty()).map(str::to_owned);
                youtube.push(YoutubeRef {
                    video_id: youtube_id(&url),
                    url,
                    title,
                    channel,
                });
            }
            _ => {
                // Unknown directive: keep the literal text.
                text.push_str(&rest[start..end]);
            }
        }
        rest = &rest[end..];
    }
    text.push_str(rest);
    (text, videos, youtube)
}

fn comrak_options() -> Options<'static> {
    let mut options = Options::default();
    options.extension.strikethrough = true;
    options.extension.table = true;
    options.extension.autolink = true;
    options.extension.tasklist = true;
    options.extension.header_id_prefix = Some("md-".to_owned());
    // Raw HTML in lesson files stays escaped: lessons are trusted but we keep
    // the renderer conservative; directives (video/youtube) are built in Rust.
    options.render.r#unsafe = false;
    options
}

/// Renders markdown to trusted HTML (raw HTML in the source is escaped by
/// comrak; wrap the result in `Unescaped` at the view layer).
pub fn render_markdown(source: &str) -> String {
    markdown_to_html(source, &comrak_options())
}

/// Renders a lesson: directives are stripped from the markdown and returned
/// separately so the page can build its video/link blocks per design.
pub fn render_lesson_markdown(source: &str) -> ParsedLesson {
    let (text, videos, youtube) = parse_directives(source);
    ParsedLesson {
        html: render_markdown(&text),
        videos,
        youtube,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_video_directive() {
        let parsed = render_lesson_markdown("# Title\n\n{{ video: explain.mp4 }}\n\nText");
        assert_eq!(
            parsed.videos,
            [VideoRef {
                file: "explain.mp4".into()
            }]
        );
        assert!(parsed.youtube.is_empty());
        assert!(!parsed.html.contains("{{"));
        assert!(parsed.html.contains("<h1"));
    }

    #[test]
    fn extracts_youtube_directive_with_id() {
        let parsed = render_lesson_markdown(
            "{{ youtube: https://youtu.be/dQw4w9WgXcQ | Python за 10 минут | Tech Channel }}",
        );
        assert_eq!(parsed.videos.len(), 0);
        assert_eq!(parsed.youtube.len(), 1);
        let link = &parsed.youtube[0];
        assert_eq!(link.video_id.as_deref(), Some("dQw4w9WgXcQ"));
        assert_eq!(link.title, "Python за 10 минут");
        assert_eq!(link.channel.as_deref(), Some("Tech Channel"));
        assert_eq!(
            link.thumbnail_url().as_deref(),
            Some("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")
        );
    }

    #[test]
    fn escapes_raw_html() {
        // comrak omits raw HTML blocks instead of escaping them inline; the
        // important part is that nothing raw reaches the output.
        let parsed = render_lesson_markdown("hello <script>alert(1)</script>");
        assert!(!parsed.html.contains("<script>"));
        assert!(parsed.html.contains("raw HTML omitted"));
    }

    #[test]
    fn unknown_directive_stays_literal() {
        let parsed = render_lesson_markdown("{{ unknown: x }}");
        assert!(parsed.html.contains("{{ unknown: x }}"));
    }

    #[test]
    fn watch_url_yields_id() {
        assert_eq!(
            youtube_id("https://www.youtube.com/watch?v=abc123XYZ_-&t=30"),
            Some("abc123XYZ_-".to_owned())
        );
        assert_eq!(youtube_id("https://example.com/video"), None);
    }
}
