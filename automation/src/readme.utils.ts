export interface IContent {
  title: string;
  topics: string[];
}

export class ReadmeUtils {
  public static href(options: { url: string; content: string }) {
    return `<a href="${options.url}">${options.content}</a>`;
  }

  public static image(options: {
    src: string;
    title: string;
    alt: string;
    height: number;
  }) {
    return `<img src="${options.src}" title="${options.title}" alt="${options.alt}" height="${options.height}" />`;
  }

  public static center(options: { content: string }) {
    return `<div align="center">${options.content}</div>`;
  }

  public static space() {
    return `&ensp;`;
  }

  public static table(content: string) {
    return `<table>${content}</table>`;
  }

  public static tableRow(content: string) {
    return `<tr>\n\n${content}\n\n</tr>`;
  }

  public static tableColumn(content: string, width: number = 50) {
    return `<td valign="top" width="${width}%">\n\n${content}\n\n</td>`;
  }

  public static createTableColumnContent(content: IContent): string[] {
    const output: string[] = [`# ${content.title}`];
    content.topics.forEach((topic) => {
      output.push(`- ${topic}`);
    });
    return output;
  }
}
