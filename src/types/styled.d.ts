import "styled-components";
import type { AppTheme } from "@/styles/theme";

declare module "styled-components" {
  // A extensão vazia é a forma exigida pelo styled-components para tipar o tema.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefaultTheme extends AppTheme {}
}
