export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // 学生列表接口
  if (path === "/api/students") {
    return new Response(
      JSON.stringify([
        { id: 1, name: "张三", email: "student1@example.com", className: "初一班" },
        { id: 2, name: "李四", email: "student2@example.com", className: "初一班" },
        { id: 3, name: "王五", email: "student3@example.com", className: "初二班" },
      ]),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  // 班级列表接口
  if (path === "/api/classes") {
    return new Response(
      JSON.stringify([
        { id: 1, name: "初一班", studentCount: 20 },
        { id: 2, name: "初二班", studentCount: 18 },
      ]),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  // 分组列表接口
  if (path === "/api/groups") {
    return new Response(
      JSON.stringify([
        { id: 1, name: "A组", class: "初一班" },
        { id: 2, name: "B组", class: "初一班" },
      ]),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  // ====================== 修复：学生/班级/分组接口（最小化添加）======================
if (path === "/api/students") {
  return new Response(JSON.stringify([]), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
if (path === "/api/classes") {
  return new Response(JSON.stringify([]), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
if (path === "/api/groups") {
  return new Response(JSON.stringify([]), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
// ================================================================================
  
  // 404
  return new Response("Not found", { status: 404 });
}
