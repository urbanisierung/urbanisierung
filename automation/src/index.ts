import { DevTo, nao } from "@flethy/connectors";
import fs from "fs";
import DATA from "./data.json";
import { ReadmeUtils } from "./readme.utils";

// inspiration https://github.com/FrancescoXX/FrancescoXX

const ASSETS_BASE =
  "https://raw.githubusercontent.com/urbanisierung/urbanisierung/master/assets";
const FILENAME = "README2.md";

class ReadmeGenerator {
  private content: string[] = [];
  private devToArticles: any[] = [];

  public addSocial() {
    const socials: string[] = [];
    for (const social of DATA.social.filter((s) => s.enabled === true)) {
      socials.push(
        ReadmeUtils.href({
          url: social.url,
          content: ReadmeUtils.image({
            src: `${ASSETS_BASE}/${social.icon}`,
            title: social.name,
            alt: social.name,
            height: 40,
          }),
        })
      );
    }

    this.content.push(
      ReadmeUtils.center({ content: socials.join(ReadmeUtils.space()) })
    );
  }

  public addIntro() {
    const person: string[] = ReadmeUtils.createTableColumnContent(
      DATA.intro.person
    );
    const stack: string[] = ReadmeUtils.createTableColumnContent(
      DATA.intro.stack
    );

    const columns: string[] = [
      ReadmeUtils.tableColumn(person.join("\n"), 75),
      ReadmeUtils.tableColumn(stack.join("\n"), 25),
    ];

    const intro = ReadmeUtils.table(ReadmeUtils.tableRow(columns.join("\n")));
    this.content.push(intro);
  }

  public async fetchDevToArticles() {
    const config = nao<DevTo.ListArticle>({
      kind: "devto.articles.list",
      "query:username": "urbanisierung",
    });
    const response = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
    });
    this.devToArticles = await response.json();
  }

  public addContent() {
    const projects: string[] = [];
    const devToArticles: string[] = ReadmeUtils.createTableColumnContent({
      title: "Recent Articles on dev.to",
      topics: this.devToArticles.slice(0, 5).map((article: any) => {
        return `[${article.title}](${article.url})`;
      }),
    });

    const columns: string[] = [
      ReadmeUtils.tableColumn(projects.join("\n"), 50),
      ReadmeUtils.tableColumn(devToArticles.join("\n"), 50),
    ];

    const content = ReadmeUtils.table(ReadmeUtils.tableRow(columns.join("\n")));
    this.content.push(content);
  }

  public generateMarkdown(): string {
    this.addSocial();
    this.addIntro();
    this.addContent();
    return this.content.join("\n");
  }

  public async generateAndSave() {
    await this.fetchDevToArticles();
    fs.writeFileSync(`${__dirname}/../${FILENAME}`, this.generateMarkdown());
  }
}

const readmeGenerator = new ReadmeGenerator();
readmeGenerator.generateAndSave();
