package courses

import (
	"bytes"
	"regexp"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
)

// YouTubeThumbURL is the thumbnail pattern shown on link cards.
const YouTubeThumbURL = "https://i.ytimg.com/vi/{id}/hqdefault.jpg"

// VideoRef is `{{video: explain.mp4}}` — a recorded video served from the
// course bundle.
type VideoRef struct {
	File string
}

// YoutubeRef is `{{youtube: URL | Title | Channel}}` — an external link card
// with a thumbnail preview.
type YoutubeRef struct {
	URL     string
	Title   string
	Channel *string
	VideoID *string
}

// ThumbnailURL returns the thumbnail when the video id is recognised.
func (r YoutubeRef) ThumbnailURL() *string {
	if r.VideoID == nil {
		return nil
	}
	url := strings.ReplaceAll(YouTubeThumbURL, "{id}", *r.VideoID)
	return &url
}

// ParsedLesson is a rendered lesson: HTML body plus extracted media.
type ParsedLesson struct {
	HTML    string
	Videos  []VideoRef
	Youtube []YoutubeRef
	Blocks  []LessonBlock
}

// LessonBlock keeps rendered text and media in their source order. Index refers
// to the corresponding Videos or Youtube entry for a media block.
type LessonBlock struct {
	Type  string `json:"type"`
	HTML  string `json:"html,omitempty"`
	Index int    `json:"index"`
}

var youtubeIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

// YoutubeID extracts the video id from common YouTube URL forms.
func YoutubeID(url string) *string {
	url = strings.TrimSpace(url)
	markers := []string{"youtu.be/", "watch?v=", "/embed/", "/shorts/", "/live/"}
	for _, marker := range markers {
		if pos := strings.Index(url, marker); pos >= 0 {
			candidate := url[pos+len(marker):]
			// Cut query/fragment/trailing slash parts.
			if cut := strings.IndexAny(candidate, "?#&/"); cut >= 0 {
				candidate = candidate[:cut]
			}
			if youtubeIDPattern.MatchString(candidate) {
				return &candidate
			}
			return nil
		}
	}
	return nil
}

// RenderMarkdown renders markdown to trusted HTML. Raw HTML in the source is
// escaped, never executed.
func RenderMarkdown(source string) (string, error) {
	md := goldmark.New(
		goldmark.WithExtensions(
			extension.Strikethrough,
			extension.Table,
			extension.Linkify,
			extension.TaskList,
		),
		goldmark.WithParserOptions(parser.WithAttribute()),
		goldmark.WithRendererOptions(html.WithHardWraps()),
	)
	var buf bytes.Buffer
	if err := md.Convert([]byte(source), &buf); err != nil {
		return "", StorageErrorf("markdown: %v", err)
	}
	return buf.String(), nil
}

// RenderLessonMarkdown renders text and media in their Markdown source order.
func RenderLessonMarkdown(source string) (ParsedLesson, error) {
	text, videos, youtube, blocks := parseDirectives(source)
	htmlBody, err := RenderMarkdown(text)
	if err != nil {
		return ParsedLesson{}, err
	}
	for i := range blocks {
		if blocks[i].Type == "html" {
			blocks[i].HTML, err = RenderMarkdown(blocks[i].HTML)
			if err != nil {
				return ParsedLesson{}, err
			}
		}
	}
	return ParsedLesson{HTML: htmlBody, Videos: videos, Youtube: youtube, Blocks: blocks}, nil
}

// parseDirectives extracts `{{ video: file }}` and `{{ youtube: URL | Title |
// Channel }}` directives. Unknown or malformed directives stay literal.
func parseDirectives(source string) (string, []VideoRef, []YoutubeRef, []LessonBlock) {
	var videos []VideoRef
	var youtube []YoutubeRef
	var text strings.Builder
	blocks := []LessonBlock{}
	textStart := 0
	flush := func() {
		chunk := text.String()[textStart:]
		if strings.TrimSpace(chunk) != "" {
			blocks = append(blocks, LessonBlock{Type: "html", HTML: chunk})
		}
		textStart = text.Len()
	}
	rest := source

	for {
		start := strings.Index(rest, "{{")
		if start < 0 {
			break
		}
		endRel := strings.Index(rest[start+2:], "}}")
		if endRel < 0 {
			break
		}
		end := start + 2 + endRel + 2
		text.WriteString(rest[:start])
		directive := strings.TrimSpace(rest[start+2 : end-2])

		kind, value, found := strings.Cut(directive, ":")
		if !found {
			// Not a known directive: keep the literal text.
			text.WriteString(rest[start:end])
			rest = rest[end:]
			continue
		}
		value = strings.TrimSpace(value)
		switch strings.ToLower(strings.TrimSpace(kind)) {
		case "video":
			if value != "" {
				flush()
				blocks = append(blocks, LessonBlock{Type: "video", Index: len(videos)})
				videos = append(videos, VideoRef{File: value})
			} else {
				text.WriteString(rest[start:end])
			}
		case "youtube":
			if value == "" {
				text.WriteString(rest[start:end])
				break
			}
			parts := strings.Split(value, "|")
			for i := range parts {
				parts[i] = strings.TrimSpace(parts[i])
			}
			url := parts[0]
			title := url
			if len(parts) > 1 && parts[1] != "" {
				title = parts[1]
			}
			ref := YoutubeRef{URL: url, Title: title, VideoID: YoutubeID(url)}
			if len(parts) > 2 && parts[2] != "" {
				channel := parts[2]
				ref.Channel = &channel
			}
			flush()
			blocks = append(blocks, LessonBlock{Type: "youtube", Index: len(youtube)})
			youtube = append(youtube, ref)
		default:
			// Unknown directive: keep the literal text.
			text.WriteString(rest[start:end])
		}
		rest = rest[end:]
	}
	text.WriteString(rest)
	flush()
	return text.String(), videos, youtube, blocks
}

// EscapeHTML escapes a fragment for safe embedding.
func EscapeHTML(s string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&#34;", "'", "&#39;")
	return replacer.Replace(s)
}
