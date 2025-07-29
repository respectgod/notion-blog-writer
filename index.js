// 📁 index.js
import { Client as NotionClient } from '@notionhq/client';
import { OpenAI } from 'openai';

// 환경변수는 GitHub Secrets로부터 가져옴
const notion = new NotionClient({ auth: process.env.NOTION_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

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

async function generateBlogText(entry) {
  const props = entry.properties;

  if (!props['음식점 이름']?.title?.[0]?.plain_text) {
    console.warn('❗ 음식점 이름이 비어있어 생략됨');
    return '';
  }

  const restaurant = props['음식점 이름']?.title?.[0]?.plain_text || '음식점';
  const menu = props['메뉴']?.rich_text[0]?.plain_text || '';
  const time = props['방문시간']?.rich_text[0]?.plain_text || '';
  const location = props['가게 위치']?.rich_text[0]?.plain_text || '';
  const open = props['영업시간']?.rich_text[0]?.plain_text || '';
  const breakTime = props['브레이크타임']?.rich_text[0]?.plain_text || '';
  const holiday = props['휴무정보']?.rich_text[0]?.plain_text || '';

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
    model: 'gpt-4',
    messages: [
      { role: 'system', content: '넌 네이버 블로그 전문 작가야.' },
      { role: 'user', content: prompt },
    ],
  });

  return completion.choices[0].message.content;
}

async function updateNotion(entry, blogText) {
  await notion.pages.update({
    page_id: entry.id,
    properties: {
      작성됨: { checkbox: true },
    },
  });

  // 🔐 안전하게 블록 추가: GPT 출력이 2000자 이상일 수 있음 → 나눠서 처리 (간단 버전)
  const blocks = [
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: blogText.slice(0, 1999) },
          },
        ],
      },
    },
  ];

  await notion.blocks.children.append({
    block_id: entry.id,
    children: blocks,
  });
}

export default async function run() {
  const rows = await fetchNotionRows();

  for (const row of rows) {
    const text = await generateBlogText(row);

    if (!text || text.trim() === '') {
      console.warn('🚫 생성된 글이 비어있어서 생략됨');
      continue; // 👈 다음 행으로 넘어가도록!
    }

    await updateNotion(row, text);
    console.log(`✅ ${row.properties['음식점 이름']?.title?.[0]?.plain_text || '???'} 작성 완료`);
  }
}


// ✅ 빠뜨렸던 실행 진입점 추가
run().catch(console.error);