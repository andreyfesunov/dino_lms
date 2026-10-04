use std::io::SeekFrom;

use courses::CourseService;
use http::HeaderValue;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
use topcoat::{
    Result,
    context::{Cx, app_context},
    router::{path_param, response::Response, route},
};

use crate::session::require_actor;

path_param!(pub course_id);
path_param!(pub chapter_id);
path_param!(pub media_file);

/// URL of a media file living in a lesson's chapter directory.
pub fn media_url(course_id: &str, chapter_id: &str, file: &str) -> String {
    format!("/media/courses/{course_id}/{chapter_id}/{file}")
}
/// Streams lesson media (recorded videos) from course bundles with HTTP Range
/// support so players can seek. topcoat's `DirectoryRoute` has no Range
/// handling, so course video gets a dedicated route.
///
/// Path: `/media/courses/{course_id}/{chapter_id}/{media_file}` — chapter
/// scoped so the access check reuses the chapter grant.
#[route(GET "/media/courses/{course_id}/{chapter_id}/{media_file}")]
async fn course_media(cx: &Cx) -> Result<Response> {
    let actor = require_actor(cx).await?;
    let courses: &CourseService = app_context(cx);
    let course_id: &str = path_param::<CourseId>(cx);
    let chapter_id: &str = path_param::<ChapterId>(cx);
    let file: &str = path_param::<MediaFile>(cx);

    // The course must exist and the user must be able to read the chapter.
    let not_found_error = topcoat::router::error::not_found();
    let Some(course) = courses.catalog().get(course_id) else {
        return Err(not_found_error.into());
    };
    let Some(chapter) = course.chapter(chapter_id) else {
        return Err(topcoat::router::error::not_found().into());
    };
    let state = courses
        .chapter_access(&actor, &course, chapter)
        .await
        .map_err(|_| topcoat::router::error::not_found())?;
    if state == courses::ChapterState::Locked {
        return Err(topcoat::router::error::not_found().into());
    }

    // Only plain file names: no dot-segments, separators, or empty parts.
    let name_ok = !file.is_empty()
        && file != "."
        && file != ".."
        && !file.contains(['/', '\\'])
        && file.split('.').all(|part| !part.is_empty());
    if !name_ok {
        return Err(topcoat::router::error::not_found().into());
    }

    let path = courses
        .catalog()
        .root()
        .join(course_id)
        .join(chapter_id)
        .join(file);
    let Ok(metadata) = tokio::fs::metadata(&path).await else {
        return Err(topcoat::router::error::not_found().into());
    };
    if !metadata.is_file() {
        return Err(topcoat::router::error::not_found().into());
    }
    let mut file = tokio::fs::File::open(&path)
        .await
        .map_err(|_| topcoat::router::error::not_found())?;

    let len = metadata.len();
    let base_headers: [(http::HeaderName, http::HeaderValue); 2] = [
        (
            http::header::ACCEPT_RANGES,
            HeaderValue::from_static("bytes"),
        ),
        (
            http::header::CONTENT_TYPE,
            HeaderValue::from_static(content_type(file_name(&path))),
        ),
    ];

    if let Some((start, end)) = parse_range(cx, len) {
        file.seek(SeekFrom::Start(start))
            .await
            .map_err(|_| topcoat::router::error::not_found())?;
        let stream_len = end - start + 1;
        let mut response = Response::new(topcoat::router::Body::empty());
        {
            let headers = response.headers_mut();
            for (name, value) in &base_headers {
                headers.insert(name.clone(), value.clone());
            }
            headers.insert(
                http::header::CONTENT_RANGE,
                HeaderValue::from_str(&format!("bytes {start}-{end}/{len}"))
                    .map_err(|_| topcoat::router::error::not_found())?,
            );
            headers.insert(http::header::CONTENT_LENGTH, HeaderValue::from(stream_len));
        }
        *response.status_mut() = http::StatusCode::PARTIAL_CONTENT;
        *response.body_mut() = stream(file, stream_len);
        return Ok(response);
    }

    let mut response = Response::new(topcoat::router::Body::empty());
    {
        let headers = response.headers_mut();
        for (name, value) in &base_headers {
            headers.insert(name.clone(), value.clone());
        }
        headers.insert(http::header::CONTENT_LENGTH, HeaderValue::from(len));
    }
    *response.body_mut() = stream(file, len);
    Ok(response)
}

/// Minimal `Range: bytes=start-end` parser (single range, suffix and
/// open-ended forms included). Returns `None` unless the header is well-formed
/// and satisfiable.
fn parse_range(cx: &Cx, len: u64) -> Option<(u64, u64)> {
    use topcoat::router::request::headers;
    parse_range_header(headers(cx), len)
}

fn parse_range_header(headers: &http::HeaderMap, len: u64) -> Option<(u64, u64)> {
    if len == 0 {
        return None;
    }
    let value = headers.get(http::header::RANGE)?.to_str().ok()?;
    let raw = value.strip_prefix("bytes=")?;
    let (start_raw, end_raw) = raw.split_once('-')?;
    let (start, end) = if start_raw.is_empty() {
        // suffix form: last N bytes
        let count: u64 = end_raw.parse().ok()?;
        let count = count.min(len);
        (len - count, len - 1)
    } else {
        let start: u64 = start_raw.parse().ok()?;
        let end = if end_raw.is_empty() {
            len - 1
        } else {
            end_raw.parse::<u64>().ok()?.min(len - 1)
        };
        if start > end {
            return None;
        }
        (start, end)
    };
    if start >= len {
        return None;
    }
    Some((start, end))
}

/// Streams up to `len` bytes starting at the current seek position.
fn stream(file: tokio::fs::File, len: u64) -> topcoat::router::Body {
    use futures_util::StreamExt;
    use http_body::Frame;
    const CHUNK: usize = 64 * 1024;
    let capacity = usize::try_from(len).map_or(CHUNK, |len| len.min(CHUNK));
    let chunks =
        ReaderStream::with_capacity(file.take(len), capacity).map(|item| item.map(Frame::data));
    topcoat::router::Body::new(http_body_util::StreamBody::new(chunks))
}

fn file_name(path: &std::path::Path) -> &str {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
}

fn content_type(name: &str) -> &'static str {
    match name.rsplit('.').next().unwrap_or_default() {
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "m4v" => "video/x-m4v",
        "ogv" => "video/ogg",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header(value: &str) -> http::HeaderMap {
        let mut map = http::HeaderMap::new();
        map.insert(http::header::RANGE, HeaderValue::from_str(value).unwrap());
        map
    }

    #[test]
    fn parses_full_range() {
        assert_eq!(
            parse_range_header(&header("bytes=0-99"), 1000),
            Some((0, 99))
        );
        assert_eq!(
            parse_range_header(&header("bytes=100-"), 1000),
            Some((100, 999))
        );
        assert_eq!(
            parse_range_header(&header("bytes=100-5000"), 1000),
            Some((100, 999))
        );
        assert_eq!(
            parse_range_header(&header("bytes=-200"), 1000),
            Some((800, 999))
        );
    }

    #[test]
    fn rejects_bad_ranges() {
        assert_eq!(parse_range_header(&header("bytes=100-50"), 1000), None);
        assert_eq!(parse_range_header(&header("bytes=1000-"), 1000), None);
        assert_eq!(parse_range_header(&header("items=0-1"), 1000), None);
        assert_eq!(parse_range_header(&http::HeaderMap::new(), 1000), None);
    }
}
