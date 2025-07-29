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
  const restaurant = props['음식점 이름'].title[0]?.plain_text || '음식점';
  const menu = props['메뉴'].rich_text[0]?.plain_text || '';
  const time = props['방문시간'].rich_text[0]?.plain_text || '';
  const location = props['가게 위치'].rich_text[0]?.plain_text || '';
  const open = props['영업시간'].rich_text[0]?.plain_text || '';
  const breakTime = props['브레이크타임'].rich_text[0]?.plain_text || '';
  const holiday = props['휴무정보'].rich_text[0]?.plain_text || '';

  const prompt = `
넌 네이버 블로그 맛집 전문 작가야. 아래 정보를 바탕으로 내 블로그 스타일에 맞는 긴 글을 써줘.

- 음식점 이름: ${restaurant}
- 메뉴: ${menu}
- 방문 시간: ${time}
- 위치: ${location}
- 영업시간: ${open}
- 브레이크타임: ${breakTime}
- 휴무: ${holiday}

블로그 형식은 다음과 같아:
타이틀, 서브타이틀, 웨이팅 시간, 영업시간, 내부사진 설명, 메뉴판 설명, 테이블 세팅, 음식 설명, SEO 해시태그 포함
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

  await notion.blocks.children.append({
    block_id: entry.id,
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: blogText } }],
        },
      },
    ],
  });
}

export default async function run() {
  const rows = await fetchNotionRows();
  for (const row of rows) {
    const text = await generateBlogText(row);
    await updateNotion(row, text);
    console.log(`✅ ${row.properties['음식점 이름'].title[0]?.plain_text} 작성 완료`);
  }
}

run().catch(console.error);