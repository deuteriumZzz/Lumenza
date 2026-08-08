import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Документы</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Политика конфиденциальности
      </h1>
      <p className="mt-4 text-sm text-muted">Действует с 6 августа 2026 года.</p>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
        Здесь объясняется, какие данные собирает Lumenza, зачем они нужны и куда
        обращаться, если вы хотите получить, изменить или удалить свои данные.
      </p>

      <div className="mt-10 flex flex-col gap-9">
        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">1. Какие данные мы собираем</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-6 text-muted">
            <li>
              <span className="text-ink">Данные аккаунта</span> — имя пользователя, email, хэш пароля,
              а также Telegram ID, если вы привязали Telegram.
            </li>
            <li>
              <span className="text-ink">Данные использования</span> — история обращений в Chat и
              Agents, промпты и результаты в Studio и Knowledge, выбранная модель, списанные кредиты
              и журнал действий в разделе «История».
            </li>
            <li>
              <span className="text-ink">Платёжные данные</span> — суммы и статусы пополнений и
              подписки. Оплату картой обрабатывает ЮKassa как независимый платёжный оператор:
              Lumenza не получает и не хранит номера карт, срок действия или CVC.
            </li>
            <li>
              <span className="text-ink">Технические данные</span> — IP-адрес, тип устройства и
              данные сессии, которые нужны для защиты аккаунта от несанкционированного доступа.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">2. Как мы используем данные</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Данные используются, чтобы обрабатывать ваши запросы и передавать их выбранной
            модели, вести общий баланс кредитов и историю между сайтом и Telegram Mini App,
            отвечать в поддержке и находить причины ошибок. Агрегированная, обезличенная
            статистика использования помогает нам понимать, какие возможности продукта
            действительно нужны. Мы не используем содержимое ваших диалогов для показа рекламы.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">3. Кому передаются данные</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-6 text-muted">
            <li>
              <span className="text-ink">ЮKassa</span> — для проведения платежей картой и подписки.
            </li>
            <li>
              <span className="text-ink">Провайдеры моделей</span> (среди них OpenAI, Anthropic, Google
              и NVIDIA) — получают только содержимое конкретного запроса, необходимое для генерации
              ответа, а не всю историю аккаунта.
            </li>
            <li>
              <span className="text-ink">Telegram</span> — если вы используете Telegram Mini App или
              бота, для синхронизации баланса и истории с вашим Telegram-аккаунтом.
            </li>
          </ul>
          <p className="mt-3 text-sm leading-6 text-muted">
            Мы не продаём данные пользователей третьим лицам.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">4. Срок хранения</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Данные аккаунта и история хранятся, пока аккаунт активен. После удаления аккаунта
            история диалогов, промпты и сгенерированный контент удаляются в течение 30 дней.
            Записи о платежах хранятся дольше — этого требует налоговое и бухгалтерское
            законодательство.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">5. Ваши права</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Вы можете запросить копию своих данных, попросить исправить неточности или
            полностью удалить аккаунт вместе с историей. Часть этих действий доступна прямо в
            профиле; для остального — напишите в поддержку по адресу ниже, мы отвечаем на такие
            запросы вручную.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">6. Безопасность</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Соединение с Lumenza защищено TLS-шифрованием. Пароли хранятся только в виде хэшей,
            не в открытом виде. Доступ к данным пользователей внутри команды ограничен тем, кому
            он нужен по роду задач.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">7. Возрастные ограничения</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Lumenza не предназначена для лиц младше 18 лет. Если вы считаете, что ребёнок
            создал аккаунт без согласия родителей, напишите нам — мы удалим аккаунт и связанные
            с ним данные.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">8. Изменения политики</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Если условия обработки данных существенно изменятся, дата в начале документа
            обновится, а действующие пользователи узнают об этом через продукт.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">9. Контакты</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            По вопросам, связанным с данными — support@lumenza.app.
          </p>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/terms" className="btn-secondary">
          Условия использования
        </Link>
        <Link href="/chat" className="btn-primary">
          Вернуться в чат
        </Link>
      </div>
    </div>
  );
}
