import { Provider } from "@/components/chat/Provider";
import { Thread } from "@/components/chat/Thread";

export default function Home() {
  return (
    <main className="page">
      <header className="top">
        <h1>TelcoCare AI</h1>
        <span className="who">Demo 客戶 A（C0001）· 虛構資料</span>
      </header>
      <Provider>
        <Thread />
      </Provider>
    </main>
  );
}
