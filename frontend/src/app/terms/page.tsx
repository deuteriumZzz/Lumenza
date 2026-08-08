import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Документы</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Условия использования
      </h1>
      <p className="mt-4 text-sm text-muted">Действуют с 6 августа 2026 года.</p>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
        Регистрируя аккаунт и используя Lumenza, вы соглашаетесь с условиями ниже. Если
        какой-то пункт вам не подходит — не используйте сервис и напишите нам, что смущает.
      </p>

      <div className="mt-10 flex flex-col gap-9">
        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">1. Что такое Lumenza</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Lumenza — рабочее пространство поверх нескольких AI-моделей: чат с умной
            маршрутизацией между провайдерами, многошаговые агенты, творческая студия
            (изображения, видео, голос), база знаний и автоматизации. Всё это работает на
            общем балансе кредитов и доступно как на сайте, так и в Telegram Mini App.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">2. Аккаунт</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Для использования Lumenza нужен аккаунт с именем пользователя, email и паролем
            (либо вход через Telegram). Вы отвечаете за сохранность пароля и за все действия,
            выполненные под вашим аккаунтом. Один аккаунт — один человек; передавать доступ
            третьим лицам нельзя.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">3. Кредиты, оплата и подписка</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Каждое действие в Lumenza — сообщение в чате, запуск агента, генерация
            изображения или озвучка — списывает кредиты с общего баланса; итоговая стоимость
            видна рядом с результатом ещё до подтверждения. Пополнить баланс можно картой —
            оплату обрабатывает ЮKassa, Lumenza не хранит данные карты. Подписка Pro стоит
            990 ₽ в месяц, открывает premium-модели и приоритетные маршруты и продлевается
            автоматически, пока вы её не отмените; отмена останавливает будущие списания, но
            доступ сохраняется до конца уже оплаченного периода. В части окружений для проверки
            продукта доступно тестовое пополнение — оно не заменяет и не имитирует реальный платёж.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">4. Допустимое использование</h2>
          <p className="mt-3 text-sm leading-6 text-muted">Используя Lumenza, вы соглашаетесь не:</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-6 text-muted">
            <li>нарушать законодательство или права третьих лиц;</li>
            <li>генерировать вредоносный, мошеннический или незаконный контент;</li>
            <li>пытаться обойти лимиты, биллинг или систему списания кредитов;</li>
            <li>перепродавать доступ к аккаунту или автоматизированно перепродавать результаты как отдельный сервис;</li>
            <li>намеренно перегружать сервис запросами, мешающими работе других пользователей.</li>
          </ul>
          <p className="mt-3 text-sm leading-6 text-muted">
            При нарушении мы вправе ограничить или прекратить доступ к аккаунту без возврата
            оставшихся кредитов.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">5. Контент и результаты</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Промпты, загруженные файлы и результаты, которые вы создаёте в Lumenza, остаются
            вашими — в рамках лицензий провайдеров моделей, которые их обрабатывают. Lumenza не
            претендует на права собственности на ваш контент. Подробнее о том, как мы обращаемся
            с данными, — в{" "}
            <Link href="/privacy" className="font-medium text-accent hover:underline">
              Политике конфиденциальности
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">6. Ограничение ответственности</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Lumenza агрегирует сторонние AI-модели и предоставляется «как есть». Результаты
            моделей могут быть неточными или неполными — принимайте решения на их основе с
            поправкой на это. Мы стараемся обеспечить резервный маршрут при сбое провайдера, но
            не гарантируем бесперебойную доступность каждой конкретной модели.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">7. Прекращение действия</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Вы можете удалить аккаунт в любой момент. Lumenza может приостановить или закрыть
            доступ к аккаунту при нарушении этих условий, а также прекратить работу отдельной
            функции или сервиса целиком, заранее предупредив об этом действующих пользователей,
            когда это возможно.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">8. Изменения условий</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Мы можем обновлять эти условия. Дата в начале документа отражает последнюю
            редакцию; при существенных изменениях мы уведомим действующих пользователей через
            продукт.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">9. Контакты</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            По вопросам об условиях использования — support@lumenza.app.
          </p>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/privacy" className="btn-secondary">
          Политика конфиденциальности
        </Link>
        <Link href="/chat" className="btn-primary">
          Вернуться в чат
        </Link>
      </div>
    </div>
  );
}
