// 📁 index.js
import { Client as NotionClient } from '@notionhq/client';
import { OpenAI } from 'openai';

const notion = new NotionClient({ auth: process.env.NOTION_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// 공통: rich_text, title, 등 안전하게 접근
function getPlainText(prop, type = 'rich_text') {
  try {
    return prop?.[type]?.[0]?.plain_text || '';
  } catch {
    return '';
  }
}

function getTitleText(prop) {
  return getPlainText(prop, 'title');
}

// ✅ Notion에서 작성되지 않은 행 가져오기
async function fetchNotionRows() {
  const response = await notion.databases.query({
    database_id: process.env.NOTION_DB_ID,
    filter: {
      property: '작성됨',
      checkbox: { equals: false },
    },
  });
  return response.results;
}

// ✅ GPT로 블로그 글 생성
async function generateBlogText(entry) {
  const props = entry.properties;

  if (!props['음식점 이름']?.title?.[0]?.plain_text) {
    console.warn('❗ 음식점 이름이 비어있어 생략됨');
    return '';
  }

  const restaurant = props['음식점 이름']?.title?.[0]?.plain_text || '음식점';

  const menu = getPlainText(props['메뉴']);
  const time = getPlainText(props['방문시간']);
  const location = getPlainText(props['가게 위치']);
  const open = getPlainText(props['영업시간']);
  const breakTime = getPlainText(props['브레이크타임']);
  const holiday = getPlainText(props['휴무정보']);

  const prompt = `
넌 네이버 블로그 맛집 전문 작가야. 아래 정보를 바탕으로 내 블로그 스타일에 맞는 긴 글을 써줘. SEO고려 해야되고, 타이틀과 서브타이틀은 한눈에 띌수 있게 해줘. 약간 어그로 끌어도됨
대답은 친근한 존댓말로 해줘. "ㅇㅇ 했어요~" 아니면 "ㅇㅇ 입니다."
맞춤법 검사는 알아서 잘 해주고, 검색을 할때는 구글 검색결과보다는 네이버 검색결과로 말해줘
메뉴는 그 음식점 검색어 유입중에 가장 많은걸 차지하는것 부터 써줘

블로그 형식은 다음과 같아:
타이틀은 
[지역이름/메뉴의카테고리] 타이틀 | ${restaurant}

내용은
타이틀 "${restaurant}"
서브타이틀
웨이팅 소요 시간
${time}
--
영업시간
평일 : ${open}
주말 : ${open}
브레이크타임 : ${breakTime}
휴무정보 : ${holiday}
--

"내부사진과 설명"
(좌석간 간격 어떤지)
"메뉴판과 설명"
(메뉴판 사진)
${menu}
(유명한 메뉴에 대한 설명)
"테이블 세팅과 설명"
(기본반찬, 테이블 기본 세팅)
"음식"
(음식 사진과 맛 설명)

seo최적화 태그들
`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: '넌 네이버 블로그 전문 작가야.' },
      { role: 'user', content: prompt },
    ],
  });

  return completion.choices?.[0]?.message?.content || '';
}

// ✅ Notion에 글 업데이트
async function updateNotion(entry, blogText) {
  // 작성됨 표시
  await notion.pages.update({
    page_id: entry.id,
    properties: {
      작성됨: { checkbox: true },
    },
  });

  // GPT 응답 길이 대응
  const MAX_BLOCK_SIZE = 1999;
  const blocks = [];

  for (let i = 0; i < blogText.length; i += MAX_BLOCK_SIZE) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: blogText.slice(i, i + MAX_BLOCK_SIZE) },
          },
        ],
      },
    });
  }

  await notion.blocks.children.append({
    block_id: entry.id,
    children: blocks,
  });
}

// ✅ 메인 실행 함수
export default async function run() {
  const rows = await fetchNotionRows();

  for (const row of rows) {
    const text = await generateBlogText(row);

    if (!text || text.trim() === '') {
      console.warn('🚫 생성된 글이 비어있어서 생략됨');
      continue;
    }

    await new Promise((res) => setTimeout(res, 1000)); // 1초 대기
    await updateNotion(row, text);

    const name = getTitleText(row.properties['음식점 이름']);
    console.log(`✅ ${row.properties['음식점 이름']?.title?.[0]?.plain_text || '???'} 작성 완료`);
    console.log('▶ props["음식점 이름"]:', JSON.stringify(props['음식점 이름'], null, 2));
  }
}

// ✅ 진입점
run().catch((err) => {
  console.error('🚨 오류 발생:', err.message);
});
