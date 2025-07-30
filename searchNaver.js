import fetch from 'node-fetch';
import cheerio from 'cheerio';

/**
 * 네이버 블로그 검색 결과 요약 추출
 * @param {string} query 검색어
 * @returns {Promise<string[]>} 요약 리스트
 */
export async function searchNaverBlogs(query) {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://search.naver.com/search.naver?where=view&sm=tab_jum&query=${encodedQuery}`;
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const summaries = [];

  $('.view_wrap.api_ani_send').slice(0, 3).each((i, el) => {
    const title = $(el).find('.title_link').text().trim();
    const desc = $(el).find('.api_txt_lines.dsc_txt').text().trim();
    if (title || desc) {
      summaries.push(`📌 ${title}\n${desc}`);
    }
  });

  return summaries;
}
